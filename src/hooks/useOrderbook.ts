// Orderbook selector hooks - Phase 3
import type { PriceLevel, OrderbookSlice } from '@/types';

export function useOrderbookBids(): PriceLevel[] {
  // Will be implemented in Phase 3
  return [];
}

export function useOrderbookAsks(): PriceLevel[] {
  // Will be implemented in Phase 3
  return [];
}

export function useSpread(): { spread: number; spreadPercent: number } | null {
  // Will be implemented in Phase 3
  return null;
}

export function useDisplayedOrderbook(): OrderbookSlice | null {
  // Will be implemented in Phase 3
  return null;
}
