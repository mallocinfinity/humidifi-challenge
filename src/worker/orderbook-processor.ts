// Orderbook processing - Phase 2
import type { BinanceDepthUpdate, BinanceDepthSnapshot, OrderbookSlice } from '@/types';

export class OrderbookProcessor {
  private bids: Map<string, number> = new Map();
  private asks: Map<string, number> = new Map();
  private lastId: number = 0;
  private depth: number = 15;

  setDepth(depth: number): void {
    this.depth = depth;
  }

  applySnapshot(_snapshot: BinanceDepthSnapshot): void {
    // Will be implemented in Phase 2
    void this.bids;
    void this.asks;
  }

  applyDelta(_update: BinanceDepthUpdate): void {
    // Will be implemented in Phase 2
  }

  getSlice(): OrderbookSlice {
    // Will be implemented in Phase 2
    void this.depth;
    return {
      bids: [],
      asks: [],
      spread: 0,
      spreadPercent: 0,
      midpoint: 0,
      timestamp: Date.now(),
      lastUpdateId: this.lastId,
    };
  }

  get lastUpdateId(): number {
    return this.lastId;
  }
}
