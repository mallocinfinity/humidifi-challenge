// Orderbook selector hooks - Phase 4
// All selectors defined at module level for reference stability

import type { PriceLevel, ConnectionStatus, Metrics, OrderbookSlice } from '@/types';
import type { SyncMode } from '@/lib/sync-mode.ts';
import { useOrderbookStore } from '@/store/orderbook';

// Stable empty array reference (never changes)
const EMPTY_LEVELS: PriceLevel[] = [];

// Type for store state
type State = {
  isFrozen: boolean;
  frozenOrderbook: OrderbookSlice | null;
  liveOrderbook: OrderbookSlice | null;
  connectionStatus: ConnectionStatus;
  error: string | null;
  metrics: Metrics;
  isLeader: boolean;
  syncMode: SyncMode;
  freeze: () => void;
  unfreeze: () => void;
};

// All selectors as stable module-level functions
const selectBids = (s: State): PriceLevel[] => {
  const ob = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  return ob?.bids ?? EMPTY_LEVELS;
};

const selectAsks = (s: State): PriceLevel[] => {
  const ob = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  return ob?.asks ?? EMPTY_LEVELS;
};

const selectSpread = (s: State): number => {
  const ob = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  return ob?.spread ?? 0;
};

const selectSpreadPercent = (s: State): number => {
  const ob = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  return ob?.spreadPercent ?? 0;
};

const selectMidpoint = (s: State): number => {
  const ob = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  return ob?.midpoint ?? 0;
};

const selectDisplayedOrderbook = (s: State): OrderbookSlice | null => {
  return s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
};

const selectConnectionStatus = (s: State): ConnectionStatus => s.connectionStatus;

const selectError = (s: State): string | null => s.error;

const selectIsFrozen = (s: State): boolean => s.isFrozen;

const selectFrozenAt = (s: State): number | null => s.frozenOrderbook?.timestamp ?? null;

const selectFreeze = (s: State) => s.freeze;

const selectUnfreeze = (s: State) => s.unfreeze;

const selectMetrics = (s: State): Metrics => s.metrics;

const selectIsLeader = (s: State): boolean => s.isLeader;

const selectSyncMode = (s: State): SyncMode => s.syncMode;

const selectMaxCumulative = (s: State): number => {
  const ob = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  if (!ob) return 0;
  const bidMax = ob.bids[ob.bids.length - 1]?.cumulative ?? 0;
  const askMax = ob.asks[ob.asks.length - 1]?.cumulative ?? 0;
  return Math.max(bidMax, askMax);
};

// Hooks using stable selectors
export function useOrderbookBids(): PriceLevel[] {
  return useOrderbookStore(selectBids);
}

export function useOrderbookAsks(): PriceLevel[] {
  return useOrderbookStore(selectAsks);
}

export function useSpreadValue(): number {
  return useOrderbookStore(selectSpread);
}

export function useSpreadPercent(): number {
  return useOrderbookStore(selectSpreadPercent);
}

export function useMidpoint(): number {
  return useOrderbookStore(selectMidpoint);
}

export function useSpread(): { spread: number; spreadPercent: number; midpoint: number } | null {
  const spread = useSpreadValue();
  const spreadPercent = useSpreadPercent();
  const midpoint = useMidpoint();
  if (midpoint === 0) return null;
  return { spread, spreadPercent, midpoint };
}

export function useDisplayedOrderbook(): OrderbookSlice | null {
  return useOrderbookStore(selectDisplayedOrderbook);
}

export function useConnectionStatus(): ConnectionStatus {
  return useOrderbookStore(selectConnectionStatus);
}

export function useError(): string | null {
  return useOrderbookStore(selectError);
}

export function useFrozenState(): { isFrozen: boolean; frozenAt: number | null } {
  const isFrozen = useOrderbookStore(selectIsFrozen);
  const frozenAt = useOrderbookStore(selectFrozenAt);
  return { isFrozen, frozenAt };
}

export function useFreezeActions(): { freeze: () => void; unfreeze: () => void } {
  const freeze = useOrderbookStore(selectFreeze);
  const unfreeze = useOrderbookStore(selectUnfreeze);
  return { freeze, unfreeze };
}

export function useMetrics(): Metrics {
  return useOrderbookStore(selectMetrics);
}

export function useIsLeader(): boolean {
  return useOrderbookStore(selectIsLeader);
}

export function useSyncMode(): SyncMode {
  return useOrderbookStore(selectSyncMode);
}

export function useMaxCumulative(): number {
  return useOrderbookStore(selectMaxCumulative);
}
