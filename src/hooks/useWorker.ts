// Worker lifecycle hook - Phase 3
// Creates worker, delegates messages to RAF bridge

import { useEffect, useRef } from 'react';
import type { WorkerToMainMessage } from '@/types';
import { useRAFBridge } from './useRAFBridge';
import { useOrderbookStore } from '@/store/orderbook';

export function useWorker(): void {
  const workerRef = useRef<Worker | null>(null);
  const { handleWorkerMessage } = useRAFBridge();
  const setConnectionStatus = useOrderbookStore((s) => s.setConnectionStatus);

  useEffect(() => {
    // Create worker
    const worker = new Worker(
      new URL('../worker/orderbook.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Handle messages from worker via RAF bridge
    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      handleWorkerMessage(event.data);
    };

    worker.onerror = (error) => {
      console.error('[Worker] Error:', error);
      setConnectionStatus('error', 'Worker error');
    };

    // Connect
    worker.postMessage({ type: 'CONNECT', symbol: 'BTCUSD' });

    // Cleanup
    return () => {
      worker.postMessage({ type: 'DISCONNECT' });
      worker.terminate();
      workerRef.current = null;
    };
  }, [handleWorkerMessage, setConnectionStatus]);
}
