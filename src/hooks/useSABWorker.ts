// SAB Worker hook - Phase 10
// Completely independent from useWorker.ts.
// Polls SharedArrayBuffer via Atomics.load in RAF loop — zero IPC for data.
// Status changes arrive via postMessage (infrequent).
// Uses DedicatedWorker (inherits crossOriginIsolated; SharedWorker does NOT).

import { useEffect, useRef } from 'react';
import type { ConnectionStatus } from '@/types';
import type { Metrics } from '@/types/metrics.ts';
import { useOrderbookStore } from '@/store/orderbook';
import { SABReader } from '@/lib/binary-protocol';
import { detectExchange, EXCHANGES } from '@/lib/exchange-config';

// SAB worker → main thread message types
interface SABReadyMessage { type: 'SAB_READY'; buffer: SharedArrayBuffer }
interface StatusMessage { type: 'STATUS_CHANGE'; status: ConnectionStatus; error?: string }
interface MetricsMessage { type: 'METRICS'; data: Partial<Metrics> }
type SABWorkerMessage = SABReadyMessage | StatusMessage | MetricsMessage;

const exchangeConfig = EXCHANGES[detectExchange()];

export function useSABWorker(): void {
  const readerRef = useRef<SABReader | null>(null);
  const lastVersionRef = useRef(0);

  // Store actions (stable references from Zustand)
  const updateLiveOrderbook = useOrderbookStore((s) => s.updateLiveOrderbook);
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);
  const updateMetrics = useOrderbookStore((s) => s.updateMetrics);
  const setIsLeader = useOrderbookStore((s) => s.setIsLeader);
  const setSyncMode = useOrderbookStore((s) => s.setSyncMode);

  useEffect(() => {
    setSyncMode('sab');
    setIsLeader(true);

    // ─── Create DedicatedWorker ──────────────────────────────────────────
    const worker = new Worker(
      new URL('../worker/orderbook.sab-worker.ts', import.meta.url),
      { type: 'module' }
    );

    // ─── Handle messages from worker ─────────────────────────────────────
    worker.onmessage = (event: MessageEvent<SABWorkerMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'SAB_READY':
          console.log('[SAB main] Received SAB_READY, byteLength:', msg.buffer.byteLength);
          readerRef.current = new SABReader(msg.buffer);
          lastVersionRef.current = 0;
          break;
        case 'STATUS_CHANGE':
          setConnectionStatus(msg.status, msg.error);
          break;
        case 'METRICS':
          updateMetrics(msg.data);
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('[SAB main] Worker error:', err);
      setConnectionStatus('error', 'SAB Worker error');
    };

    worker.postMessage({ type: 'CONNECT', ...exchangeConfig });

    // ─── Metrics counters — O(1) replacements for RollingAverage ────────
    // RollingAverage had O(100) Array.shift() per add + copy+sort for p95 +
    // Math.min/max spread — all inside the RAF callback. These O(1) counters
    // give the same stats with zero allocations and zero array operations.
    let isRunning = true;
    let lastFrameTime = performance.now();
    let lastMetricsUpdate = performance.now();
    let messageCount = 0;
    let latSum = 0;
    let latCount = 0;
    let latMin = Infinity;
    let latMax = 0;
    let latLast = 0;

    // ─── RAF loop — matches SharedWorker's useRAFBridge pattern exactly ──
    // Metrics computed + published inside RAF (same as SharedWorker) so
    // updateMetrics batches with updateLiveOrderbook in the same React cycle.
    // Only difference: O(1) counters instead of RollingAverage.
    const tick = () => {
      if (!isRunning) return;

      const now = performance.now();
      const frameDelta = now - lastFrameTime;
      lastFrameTime = now;
      const droppedFrames = frameDelta > 16.67 ? 1 : 0;

      // Poll SAB — cached views, zero allocation for version check
      const reader = readerRef.current;
      if (reader) {
        const v = reader.readVersion();
        if (v > lastVersionRef.current) {
          lastVersionRef.current = v;
          messageCount++;

          // When frozen: skip decode to avoid mutating pooled PriceLevel objects
          // that the frozen snapshot still references. Version stays current so
          // there's no stale burst on unfreeze.
          if (!useOrderbookStore.getState().isFrozen) {
            const slice = reader.decode();
            updateLiveOrderbook(slice);

            const lat = performance.now() - now;
            latLast = lat;
            latSum += lat;
            latCount++;
            if (lat < latMin) latMin = lat;
            if (lat > latMax) latMax = lat;
          }
        }
      }

      // Metrics every second — inside RAF, matching SharedWorker's useRAFBridge.
      // O(1) computation: just reads cached min/max/sum/count. No sort, no spread.
      if (now - lastMetricsUpdate >= 1000) {
        const avg = latCount > 0 ? latSum / latCount : 0;
        updateMetrics({
          messagesPerSecond: messageCount,
          latencyMs: {
            current: Math.round(latLast * 100) / 100,
            avg: Math.round(avg * 100) / 100,
            min: latMin === Infinity ? 0 : Math.round(latMin * 100) / 100,
            max: Math.round(latMax * 100) / 100,
            p95: Math.round(latMax * 100) / 100,
          },
          fps: Math.round(1000 / frameDelta),
          droppedFrames,
        });
        messageCount = 0;
        latSum = 0;
        latCount = 0;
        latMin = Infinity;
        latMax = 0;
        lastMetricsUpdate = now;
      }

      requestAnimationFrame(tick);
    };

    const rafId = requestAnimationFrame(tick);

    // ─── Cleanup ────────────────────────────────────────────────────────
    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
      worker.postMessage({ type: 'DISCONNECT' });
      worker.terminate();
      readerRef.current = null;
    };
  }, [updateLiveOrderbook, setConnectionStatus, updateMetrics, setIsLeader, setSyncMode]);
}
