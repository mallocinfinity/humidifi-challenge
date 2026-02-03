// Orderbook selector hooks - Phase 3
// Granular selectors with shallow equality for optimal re-renders

import { useShallow } from 'zustand/react/shallow';
import type { PriceLevel, OrderbookSlice, ConnectionStatus, Metrics } from '@/types';
import { useOrderbookStore } from '@/store/orderbook';

// Get bids from displayed orderbook (frozen or live)
export function useOrderbookBids(): PriceLevel[] {
  return useOrderbookStore((s) => {
    const orderbook = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
    return orderbook?.bids ?? [];
  });
}

// Get asks from displayed orderbook (frozen or live)
export function useOrderbookAsks(): PriceLevel[] {
  return useOrderbookStore((s) => {
    const orderbook = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
    return orderbook?.asks ?? [];
  });
}

// Get spread info
export function useSpread(): { spread: number; spreadPercent: number; midpoint: number } | null {
  return useOrderbookStore(
    useShallow((s) => {
      const orderbook = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
      if (!orderbook) return null;
      return {
        spread: orderbook.spread,
        spreadPercent: orderbook.spreadPercent,
        midpoint: orderbook.midpoint,
      };
    })
  );
}

// Get full displayed orderbook (frozen or live)
export function useDisplayedOrderbook(): OrderbookSlice | null {
  return useOrderbookStore((s) => {
    return s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
  });
}

// Get connection status
export function useConnectionStatus(): ConnectionStatus {
  return useOrderbookStore((s) => s.connectionStatus);
}

// Get error state
export function useError(): string | null {
  return useOrderbookStore((s) => s.error);
}

// Get frozen state
export function useFrozenState(): { isFrozen: boolean; frozenAt: number | null } {
  return useOrderbookStore(
    useShallow((s) => ({
      isFrozen: s.isFrozen,
      frozenAt: s.frozenOrderbook?.timestamp ?? null,
    }))
  );
}

// Get freeze/unfreeze actions
export function useFreezeActions(): { freeze: () => void; unfreeze: () => void } {
  return useOrderbookStore(
    useShallow((s) => ({
      freeze: s.freeze,
      unfreeze: s.unfreeze,
    }))
  );
}

// Get metrics
export function useMetrics(): Metrics {
  return useOrderbookStore((s) => s.metrics);
}

// Get max cumulative for depth bar calculations
export function useMaxCumulative(): number {
  return useOrderbookStore((s) => {
    const orderbook = s.isFrozen ? s.frozenOrderbook : s.liveOrderbook;
    if (!orderbook) return 0;
    const bidMax = orderbook.bids[orderbook.bids.length - 1]?.cumulative ?? 0;
    const askMax = orderbook.asks[orderbook.asks.length - 1]?.cumulative ?? 0;
    return Math.max(bidMax, askMax);
  });
}
