// Worker lifecycle hook - Phase 8
// Leader tab owns Worker/WebSocket and broadcasts to followers via BroadcastChannel.
// Follower tabs receive data from the channel — no Worker needed.

import { useEffect, useRef, useCallback } from 'react';
import type { WorkerToMainMessage } from '@/types';
import { useRAFBridge } from './useRAFBridge';
import { useOrderbookStore } from '@/store/orderbook';
import { LeaderElection } from '@/lib/leader-election';
import { OrderbookBroadcast } from '@/lib/broadcast-channel';

const PING_INTERVAL = 2000;       // Followers ping every 2s
const PING_STALE_THRESHOLD = 5000; // Prune tabs not seen in 5s

export function useWorker(): void {
  const workerRef = useRef<Worker | null>(null);
  const electionRef = useRef<LeaderElection | null>(null);
  const channelRef = useRef<OrderbookBroadcast | null>(null);
  const { handleWorkerMessage } = useRAFBridge();
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);
  const updateMetrics = useOrderbookStore((s) => s.updateMetrics);
  const setIsLeader = useOrderbookStore((s) => s.setIsLeader);

  // Stable ref for handleWorkerMessage so callbacks don't go stale
  const handleMessageRef = useRef(handleWorkerMessage);
  handleMessageRef.current = handleWorkerMessage;

  // Pending broadcast state — coalesces to one broadcast per RAF frame
  const pendingBroadcastRef = useRef<WorkerToMainMessage | null>(null);
  const broadcastRafRef = useRef<number | null>(null);

  const createWorker = useCallback(() => {
    const worker = new Worker(
      new URL('../worker/orderbook.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;
      // Feed to RAF bridge
      handleMessageRef.current(msg);
      // Coalesce broadcasts: store latest, send once per frame
      if (msg.type === 'ORDERBOOK_UPDATE') {
        pendingBroadcastRef.current = msg;
        if (broadcastRafRef.current === null) {
          broadcastRafRef.current = requestAnimationFrame(() => {
            broadcastRafRef.current = null;
            const pending = pendingBroadcastRef.current;
            if (pending) {
              channelRef.current?.broadcast(pending);
              pendingBroadcastRef.current = null;
            }
          });
        }
      } else {
        // Non-data messages (STATUS_CHANGE) are rare — broadcast immediately
        channelRef.current?.broadcast(msg);
      }
    };

    worker.onerror = (error) => {
      console.error('[Worker] Error:', error);
      setConnectionStatus('error', 'Worker error');
    };

    worker.postMessage({ type: 'CONNECT', symbol: 'BTCUSD' });
    workerRef.current = worker;
  }, [setConnectionStatus]);

  const destroyWorker = useCallback(() => {
    if (broadcastRafRef.current !== null) {
      cancelAnimationFrame(broadcastRafRef.current);
      broadcastRafRef.current = null;
    }
    pendingBroadcastRef.current = null;
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'DISCONNECT' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Create broadcast channel
    const channel = new OrderbookBroadcast();
    channelRef.current = channel;

    // --- Follower data listener ---
    let followerReceivedData = false;
    channel.onMessage((msg) => {
      if (!followerReceivedData && msg.type === 'ORDERBOOK_UPDATE') {
        followerReceivedData = true;
        setConnectionStatus('connected');
      }
      handleMessageRef.current(msg);
    });

    // --- Tab count: follower receives count from leader ---
    channel.onTabCount((count) => {
      updateMetrics({ tabCount: count });
    });

    // --- Tab count: leader tracks follower pings ---
    // Map of tabId → last ping timestamp
    const followerPings = new Map<string, number>();
    let tabCountInterval: ReturnType<typeof setInterval> | null = null;

    channel.onPing((tabId) => {
      followerPings.set(tabId, Date.now());
    });

    const startTabCountTracking = () => {
      // Prune stale followers and broadcast count every PING_INTERVAL
      tabCountInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, ts] of followerPings) {
          if (now - ts > PING_STALE_THRESHOLD) {
            followerPings.delete(id);
          }
        }
        const count = 1 + followerPings.size; // leader + active followers
        updateMetrics({ tabCount: count });
        channel.broadcastTabCount(count);
      }, PING_INTERVAL);
    };

    const stopTabCountTracking = () => {
      if (tabCountInterval) {
        clearInterval(tabCountInterval);
        tabCountInterval = null;
      }
      followerPings.clear();
    };

    // --- Follower ping interval ---
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const startPinging = () => {
      channel.sendPing(tabId); // Immediate first ping
      pingInterval = setInterval(() => {
        channel.sendPing(tabId);
      }, PING_INTERVAL);
    };

    const stopPinging = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    // --- Leader election ---
    const election = new LeaderElection({
      onBecomeLeader: () => {
        channel.setLeader(true);
        setIsLeader(true);
        stopPinging();
        startTabCountTracking();
        updateMetrics({ tabCount: 1 });
        createWorker();
      },
      onBecomeFollower: () => {
        channel.setLeader(false);
        setIsLeader(false);
        stopTabCountTracking();
        startPinging();
        destroyWorker();
        setConnectionStatus('connected');
      },
    });
    electionRef.current = election;

    // Start election
    election.start();

    // If we're a follower from the start, begin pinging and set connecting status
    if (!election.isLeader) {
      setConnectionStatus('connecting');
      startPinging();
    }

    return () => {
      election.stop();
      destroyWorker();
      stopPinging();
      stopTabCountTracking();
      channel.close();
      electionRef.current = null;
      channelRef.current = null;
    };
  }, [createWorker, destroyWorker, setConnectionStatus, updateMetrics, setIsLeader]);
}
