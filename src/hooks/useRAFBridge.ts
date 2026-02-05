// RAF bridge hook - Phase 3
// Batches worker updates to sync with display refresh rate (60fps max)

import { useEffect, useRef, useCallback } from 'react';
import type { WorkerToMainMessage, OrderbookSlice } from '@/types';
import { useOrderbookStore } from '@/store/orderbook';

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
  const messageCountRef = useRef(0);

  // Get store actions
  const updateLiveOrderbook = useOrderbookStore((s) => s.updateLiveOrderbook);
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);
  const updateMetrics = useOrderbookStore((s) => s.updateMetrics);

  // RAF loop
  useEffect(() => {
    let isRunning = true;
    let droppedFrameCount = 0;
    let lastMetricsUpdate = performance.now();
    let frameCount = 0;
    let latSum = 0;
    let latCount = 0;
    let latMin = Infinity;
    let latMax = 0;
    let latLast = 0;
    const frameBudget = 1000 / 60;

    const resetMetrics = () => {
      droppedFrameCount = 0;
      frameCount = 0;
      latSum = 0;
      latCount = 0;
      latMin = Infinity;
      latMax = 0;
      latLast = 0;
      messageCountRef.current = 0;
      lastMetricsUpdate = performance.now();
      lastFrameTimeRef.current = lastMetricsUpdate;
    };

    const handleVisibilityChange = () => {
      // Prevent huge frame deltas + latency spikes when returning from background.
      resetMetrics();
      if (stateRef.current.latestData) {
        stateRef.current.receiveTime = performance.now();
        stateRef.current.dirty = true;
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Ignore RAF callback's `now` parameter — it's the frame start timestamp,
    // not the current time. Using it causes negative latency when a message
    // arrives between frame start and callback execution.
    const tick = () => {
      if (!isRunning) return;

      const now = performance.now();

      const isHidden = typeof document !== 'undefined' && document.hidden;

      // Track frame timing
      if (!isHidden) {
        frameCount++;
      }
      const frameDelta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Count truly missed frames (e.g. 33ms ≈ 1 missed, 50ms ≈ 2 missed)
      if (!isHidden) {
        const missed = Math.max(0, Math.floor(frameDelta / frameBudget) - 1);
        if (missed > 0) droppedFrameCount += missed;
      }

      // If we have new data, push to store
      if (stateRef.current.dirty && stateRef.current.latestData) {
        const latency = now - stateRef.current.receiveTime;
        latLast = latency;
        latSum += latency;
        latCount++;
        if (latency < latMin) latMin = latency;
        if (latency > latMax) latMax = latency;

        updateLiveOrderbook(stateRef.current.latestData);
        stateRef.current.dirty = false;
      }

      // Update metrics every second
      const elapsed = now - lastMetricsUpdate;
      if (!isHidden && elapsed >= 1000) {
        const avg = latCount > 0 ? latSum / latCount : 0;
        const fps = elapsed > 0 ? Math.round((frameCount * 1000) / elapsed) : 0;
        updateMetrics({
          messagesPerSecond: messageCountRef.current,
          latencyMs: {
            current: Math.round(latLast * 100) / 100,
            avg: Math.round(avg * 100) / 100,
            min: latMin === Infinity ? 0 : Math.round(latMin * 100) / 100,
            max: Math.round(latMax * 100) / 100,
            p95: Math.round(latMax * 100) / 100,
          },
          fps,
          droppedFrames: droppedFrameCount,
        });
        messageCountRef.current = 0;
        droppedFrameCount = 0;
        frameCount = 0;
        latSum = 0;
        latCount = 0;
        latMin = Infinity;
        latMax = 0;
        lastMetricsUpdate = now;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [updateLiveOrderbook, updateMetrics]);

  // Handle incoming worker messages.
  // Always stamps receiveTime with local performance.now() — never use cross-tab
  // timestamps since performance.now() origin differs per tab.
  const handleWorkerMessage = useCallback(
    (message: WorkerToMainMessage) => {
      switch (message.type) {
        case 'ORDERBOOK_UPDATE':
          messageCountRef.current++;
          stateRef.current.latestData = message.data;
          stateRef.current.receiveTime = performance.now();
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
