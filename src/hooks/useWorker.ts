// Worker lifecycle hook - Phase 9
// SharedWorker (default): all tabs connect to one worker, no leader election.
// BroadcastChannel (fallback): leader tab owns Worker/WebSocket, broadcasts to followers.

import { useEffect, useRef, useCallback } from 'react';
import type { WorkerToMainMessage } from '@/types';
import { detectSyncMode } from '@/lib/sync-mode';
import { detectExchange, EXCHANGES } from '@/lib/exchange-config';
import { useRAFBridge } from './useRAFBridge';
import { useOrderbookStore } from '@/store/orderbook';
import { LeaderElection } from '@/lib/leader-election';
import { OrderbookBroadcast } from '@/lib/broadcast-channel';

const PING_INTERVAL = 2000;       // Followers ping every 2s
const PING_STALE_THRESHOLD = 5000; // Prune tabs not seen in 5s

// ─── SharedWorker path ────────────────────────────────────────────────────────

function useSharedWorkerMode(): void {
  const sharedWorkerRef = useRef<SharedWorker | null>(null);
  const { handleWorkerMessage } = useRAFBridge();
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);
  const updateMetrics = useOrderbookStore((s) => s.updateMetrics);
  const setIsLeader = useOrderbookStore((s) => s.setIsLeader);
  const setSyncMode = useOrderbookStore((s) => s.setSyncMode);

  const handleMessageRef = useRef(handleWorkerMessage);
  handleMessageRef.current = handleWorkerMessage;

  useEffect(() => {
    setSyncMode('shared');
    // All tabs are peers in SharedWorker mode
    setIsLeader(true);

    const worker = new SharedWorker(
      new URL('../worker/orderbook.shared-worker.ts', import.meta.url),
      { type: 'module' }
    );
    sharedWorkerRef.current = worker;

    worker.port.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;

      // Tab count arrives via METRICS messages from the worker
      if (msg.type === 'METRICS' && msg.data.tabCount !== undefined) {
        updateMetrics({ tabCount: msg.data.tabCount });
        return;
      }

      handleMessageRef.current(msg);
    };

    worker.onerror = (error) => {
      console.error('[SharedWorker] Error:', error);
      setConnectionStatus('error', 'SharedWorker error');
    };

    // Connect to the shared WebSocket
    worker.port.postMessage({ type: 'CONNECT', ...exchangeConfig });
    worker.port.start();

    return () => {
      worker.port.postMessage({ type: 'DISCONNECT' });
      worker.port.close();
      sharedWorkerRef.current = null;
    };
  }, [setConnectionStatus, updateMetrics, setIsLeader, setSyncMode]);
}

// ─── BroadcastChannel path ────────────────────────────────────────────────────

function useBroadcastMode(): void {
  const workerRef = useRef<Worker | null>(null);
  const electionRef = useRef<LeaderElection | null>(null);
  const channelRef = useRef<OrderbookBroadcast | null>(null);
  const { handleWorkerMessage } = useRAFBridge();
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);
  const updateMetrics = useOrderbookStore((s) => s.updateMetrics);
  const setIsLeader = useOrderbookStore((s) => s.setIsLeader);
  const setSyncMode = useOrderbookStore((s) => s.setSyncMode);

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

    worker.postMessage({ type: 'CONNECT', ...exchangeConfig });
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
    setSyncMode('broadcast');

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
    const followerPings = new Map<string, number>();
    let tabCountInterval: ReturnType<typeof setInterval> | null = null;

    channel.onPing((tabId) => {
      followerPings.set(tabId, Date.now());
    });

    const startTabCountTracking = () => {
      tabCountInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, ts] of followerPings) {
          if (now - ts > PING_STALE_THRESHOLD) {
            followerPings.delete(id);
          }
        }
        const count = 1 + followerPings.size;
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
      channel.sendPing(tabId);
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

    election.start();

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
  }, [createWorker, destroyWorker, setConnectionStatus, updateMetrics, setIsLeader, setSyncMode]);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const syncMode = detectSyncMode();
const exchangeConfig = EXCHANGES[detectExchange()];

export function useWorker(): void {
  if (syncMode === 'shared') {
    useSharedWorkerMode();
  } else {
    useBroadcastMode();
  }
}
