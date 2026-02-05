// ============================================================================
// WORKER MESSAGE TYPES
// ============================================================================

import type { OrderbookSlice, ConnectionStatus } from './orderbook.ts';
import type { Metrics } from './metrics.ts';

/** Messages from Main Thread → Worker */
export type MainToWorkerMessage =
  | { type: 'CONNECT'; symbol: string; wsUrl: string; restUrl: string; streamSuffix: string }
  | { type: 'DISCONNECT' }
  | { type: 'PING' }
  | { type: 'VISIBILITY'; hidden: boolean }
  | { type: 'SET_DEPTH'; depth: number };  // Change from 15 to N levels

/** Messages from Worker → Main Thread */
export type WorkerToMainMessage =
  | { type: 'ORDERBOOK_UPDATE'; data: OrderbookSlice; workerTimestamp: number }
  | { type: 'STATUS_CHANGE'; status: ConnectionStatus; error?: string }
  | { type: 'METRICS'; data: Partial<Metrics> };

/** Type guard for MainToWorkerMessage */
export function isMainToWorkerMessage(data: unknown): data is MainToWorkerMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as MainToWorkerMessage).type === 'string'
  );
}

/** Type guard for WorkerToMainMessage */
export function isWorkerToMainMessage(data: unknown): data is WorkerToMainMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    ['ORDERBOOK_UPDATE', 'STATUS_CHANGE', 'METRICS'].includes(
      (data as WorkerToMainMessage).type
    )
  );
}
