// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Binance API types
export type {
  BinanceDepthUpdate,
  BinanceDepthSnapshot,
} from './binance.ts';
export {
  isBinanceDepthUpdate,
  isBinanceDepthSnapshot,
} from './binance.ts';

// Internal orderbook types
export type {
  PriceLevel,
  OrderbookSlice,
  ConnectionStatus,
} from './orderbook.ts';

// Metrics types
export type {
  LatencyMetrics,
  Metrics,
} from './metrics.ts';
export { DEFAULT_METRICS } from './metrics.ts';

// Worker message types
export type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './messages.ts';
export {
  isMainToWorkerMessage,
  isWorkerToMainMessage,
} from './messages.ts';

// Store types
export type { OrderbookStore } from './store.ts';

// Sync mode
export type { SyncMode } from '@/lib/sync-mode.ts';
export { detectSyncMode } from '@/lib/sync-mode.ts';

// Component props types
export type {
  OrderBookRowProps,
} from './components.ts';
