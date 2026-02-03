// Zustand store - Phase 3
import { create } from 'zustand';
import type { OrderbookStore } from '@/types';
import { DEFAULT_METRICS } from '@/types';

export const useOrderbookStore = create<OrderbookStore>((set, get) => ({
  // Initial state
  liveOrderbook: null,
  frozenOrderbook: null,
  isFrozen: false,
  connectionStatus: 'disconnected',
  error: null,
  metrics: DEFAULT_METRICS,
  isLeader: false,

  // Actions
  updateLiveOrderbook: (slice) => {
    set({ liveOrderbook: slice });
  },

  freeze: () => {
    const { liveOrderbook } = get();
    set({
      isFrozen: true,
      frozenOrderbook: liveOrderbook,
    });
  },

  unfreeze: () => {
    set({
      isFrozen: false,
      frozenOrderbook: null,
    });
  },

  setConnectionStatus: (status, error) => {
    set({
      connectionStatus: status,
      error: error ?? null,
    });
  },

  updateMetrics: (partial) => {
    set((state) => ({
      metrics: { ...state.metrics, ...partial },
    }));
  },

  setIsLeader: (isLeader) => {
    set({ isLeader });
  },
}));
