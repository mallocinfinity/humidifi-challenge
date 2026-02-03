// Worker lifecycle hook - Phase 1
import { useEffect, useRef, useState } from 'react';
import type { WorkerToMainMessage, ConnectionStatus } from '@/types';

export interface UseWorkerReturn {
  status: ConnectionStatus;
  messageCount: number;
}

export function useWorker(): UseWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    // Create worker
    const worker = new Worker(
      new URL('../worker/orderbook.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Handle messages from worker
    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'STATUS_CHANGE':
          setStatus(message.status);
          console.log('[Worker] Status:', message.status);
          break;

        case 'ORDERBOOK_UPDATE':
          setMessageCount((c) => c + 1);
          console.log('[Worker] Orderbook update:', {
            bestBid: message.data.bids[0]?.price,
            bestAsk: message.data.asks[0]?.price,
            spread: message.data.spread.toFixed(2),
            levels: message.data.bids.length,
          });
          break;

        case 'METRICS':
          console.log('[Worker] Metrics:', message.data);
          break;
      }
    };

    worker.onerror = (error) => {
      console.error('[Worker] Error:', error);
      setStatus('error');
    };

    // Connect
    worker.postMessage({ type: 'CONNECT', symbol: 'BTCUSD' });

    // Cleanup
    return () => {
      worker.postMessage({ type: 'DISCONNECT' });
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  return { status, messageCount };
}
