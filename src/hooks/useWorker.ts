// Worker lifecycle hook - Phase 8
// Leader tab owns Worker/WebSocket and broadcasts to followers via BroadcastChannel.
// Follower tabs receive data from the channel — no Worker needed.

import { useEffect, useRef, useCallback } from 'react';
import type { WorkerToMainMessage } from '@/types';
import { useRAFBridge } from './useRAFBridge';
import { useOrderbookStore } from '@/store/orderbook';
import { LeaderElection } from '@/lib/leader-election';
import { OrderbookBroadcast } from '@/lib/broadcast-channel';

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

  const createWorker = useCallback(() => {
    const worker = new Worker(
      new URL('../worker/orderbook.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;
      // Feed to RAF bridge
      handleMessageRef.current(msg);
      // Broadcast to follower tabs
      channelRef.current?.broadcast(msg);
    };

    worker.onerror = (error) => {
      console.error('[Worker] Error:', error);
      setConnectionStatus('error', 'Worker error');
    };

    worker.postMessage({ type: 'CONNECT', symbol: 'BTCUSD' });
    workerRef.current = worker;
  }, [setConnectionStatus]);

  const destroyWorker = useCallback(() => {
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

    // Set up follower message listener — active when not leader.
    // Track whether we've received data yet to flip status from 'connecting'.
    let followerReceivedData = false;
    channel.onMessage((msg) => {
      if (!followerReceivedData && msg.type === 'ORDERBOOK_UPDATE') {
        followerReceivedData = true;
        setConnectionStatus('connected');
      }
      handleMessageRef.current(msg);
    });

    // Create leader election
    const election = new LeaderElection({
      onBecomeLeader: () => {
        console.log('[Tab] Became leader');
        channel.setLeader(true);
        setIsLeader(true);
        updateMetrics({ tabCount: 1 });
        createWorker();
      },
      onBecomeFollower: () => {
        console.log('[Tab] Became follower');
        channel.setLeader(false);
        setIsLeader(false);
        destroyWorker();
        setConnectionStatus('connected');
      },
    });
    electionRef.current = election;

    // Start election
    election.start();

    // If we're a follower from the start, set connected status
    // (data will arrive via BroadcastChannel once leader sends it)
    if (!election.isLeader) {
      setConnectionStatus('connecting');
    }

    return () => {
      election.stop();
      destroyWorker();
      channel.close();
      electionRef.current = null;
      channelRef.current = null;
    };
  }, [createWorker, destroyWorker, setConnectionStatus, updateMetrics, setIsLeader]);
}
