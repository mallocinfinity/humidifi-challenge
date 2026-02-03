// RAF bridge hook - Phase 3
// Batches worker updates to sync with display refresh rate (60fps max)

import { useEffect, useRef, useCallback } from 'react';
import type { WorkerToMainMessage, OrderbookSlice } from '@/types';
import { useOrderbookStore } from '@/store/orderbook';
import { RollingAverage } from '@/lib/perf-utils';

interface RAFBridgeState {
  latestData: OrderbookSlice | null;
  receiveTime: number;  // Main thread time when message was received
  dirty: boolean;
}

export interface UseRAFBridgeReturn {
  handleWorkerMessage: (message: WorkerToMainMessage) => void;
}

export function useRAFBridge(): UseRAFBridgeReturn {
  const stateRef = useRef<RAFBridgeState>({
    latestData: null,
    receiveTime: 0,
    dirty: false,
  });

  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const latencyTracker = useRef(new RollingAverage(100));
  const messageCountRef = useRef(0);
  const lastMetricsUpdateRef = useRef(performance.now());

  // Get store actions
  const updateLiveOrderbook = useOrderbookStore((s) => s.updateLiveOrderbook);
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);
  const updateMetrics = useOrderbookStore((s) => s.updateMetrics);

  // RAF loop
  useEffect(() => {
    let isRunning = true;

    const tick = (now: number) => {
      if (!isRunning) return;

      // Track frame timing
      const frameDelta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Check for dropped frames (>16.67ms = missed 60fps target)
      const droppedFrames = frameDelta > 16.67 ? 1 : 0;

      // If we have new data, push to store
      if (stateRef.current.dirty && stateRef.current.latestData) {
        // Latency = time from message receipt to RAF processing (same time origin)
        const latency = now - stateRef.current.receiveTime;
        latencyTracker.current.add(latency);

        updateLiveOrderbook(stateRef.current.latestData);
        stateRef.current.dirty = false;
      }

      // Update metrics every second
      if (now - lastMetricsUpdateRef.current >= 1000) {
        const tracker = latencyTracker.current;
        updateMetrics({
          messagesPerSecond: messageCountRef.current,
          latencyMs: {
            current: tracker.values[tracker.values.length - 1] ?? 0,
            avg: Math.round(tracker.average * 100) / 100,
            min: Math.round(tracker.min * 100) / 100,
            max: Math.round(tracker.max * 100) / 100,
            p95: Math.round(tracker.p95 * 100) / 100,
          },
          fps: Math.round(1000 / frameDelta),
          droppedFrames,
        });
        messageCountRef.current = 0;
        lastMetricsUpdateRef.current = now;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [updateLiveOrderbook, updateMetrics]);

  // Handle incoming worker messages
  const handleWorkerMessage = useCallback(
    (message: WorkerToMainMessage) => {
      switch (message.type) {
        case 'ORDERBOOK_UPDATE':
          messageCountRef.current++;
          stateRef.current.latestData = message.data;
          stateRef.current.receiveTime = performance.now();  // Main thread time
          stateRef.current.dirty = true;
          break;

        case 'STATUS_CHANGE':
          setConnectionStatus(message.status, message.error);
          break;

        case 'METRICS':
          updateMetrics(message.data);
          break;
      }
    },
    [setConnectionStatus, updateMetrics]
  );

  return { handleWorkerMessage };
}
