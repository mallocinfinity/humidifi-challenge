// ============================================================================
// ZUSTAND STORE TYPES
// ============================================================================

import type { OrderbookSlice, ConnectionStatus } from './orderbook.ts';
import type { Metrics } from './metrics.ts';
import type { SyncMode } from '@/lib/sync-mode.ts';

/** Zustand store state and actions */
export interface OrderbookStore {
  // State
  liveOrderbook: OrderbookSlice | null;
  frozenOrderbook: OrderbookSlice | null;
  isFrozen: boolean;
  connectionStatus: ConnectionStatus;
  error: string | null;
  metrics: Metrics;
  isLeader: boolean;
  syncMode: SyncMode;

  // Actions
  updateLiveOrderbook: (slice: OrderbookSlice) => void;
  freeze: () => void;
  unfreeze: () => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  updateMetrics: (partial: Partial<Metrics>) => void;
  setIsLeader: (isLeader: boolean) => void;
  setSyncMode: (mode: SyncMode) => void;
}
