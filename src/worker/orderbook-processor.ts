// Orderbook processing - Phase 2
// Maintains order book state and computes UI-ready slices

import type { BinanceDepthUpdate, BinanceDepthSnapshot, OrderbookSlice, PriceLevel } from '@/types';

export class OrderbookProcessor {
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private lastId: number = 0;
  private depth: number = 15;

  setDepth(depth: number): void {
    this.depth = depth;
  }

  applySnapshot(snapshot: BinanceDepthSnapshot): void {
    this.bids.clear();
    this.asks.clear();

    for (const [price, quantity] of snapshot.bids) {
      const p = parseFloat(price);
      const qty = parseFloat(quantity);
      if (isNaN(p) || isNaN(qty)) continue;
      if (qty > 0) {
        this.bids.set(p, qty);
      }
    }

    for (const [price, quantity] of snapshot.asks) {
      const p = parseFloat(price);
      const qty = parseFloat(quantity);
      if (isNaN(p) || isNaN(qty)) continue;
      if (qty > 0) {
        this.asks.set(p, qty);
      }
    }

    this.lastId = snapshot.lastUpdateId;
  }

  applyDelta(update: BinanceDepthUpdate): void {
    // Apply bid updates
    for (const [price, quantity] of update.b) {
      const p = parseFloat(price);
      const qty = parseFloat(quantity);
      if (isNaN(p) || isNaN(qty)) continue;
      if (qty === 0) {
        this.bids.delete(p);
      } else {
        this.bids.set(p, qty);
      }
    }

    // Apply ask updates
    for (const [price, quantity] of update.a) {
      const p = parseFloat(price);
      const qty = parseFloat(quantity);
      if (isNaN(p) || isNaN(qty)) continue;
      if (qty === 0) {
        this.asks.delete(p);
      } else {
        this.asks.set(p, qty);
      }
    }

    this.lastId = update.u;
  }

  getSlice(): OrderbookSlice {
    // Sort and slice bids (highest price first)
    // Keys are already numbers — no parseFloat needed here
    const sortedBids = Array.from(this.bids.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => b.price - a.price)
      .slice(0, this.depth);

    // Sort and slice asks (lowest price first)
    const sortedAsks = Array.from(this.asks.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => a.price - b.price)
      .slice(0, this.depth);

    // Calculate cumulative values
    const bidLevels = this.calculateCumulative(sortedBids);
    const askLevels = this.calculateCumulative(sortedAsks);

    // Calculate depth percentages relative to max cumulative
    const maxCumulative = Math.max(
      bidLevels[bidLevels.length - 1]?.cumulative ?? 0,
      askLevels[askLevels.length - 1]?.cumulative ?? 0
    );

    if (maxCumulative > 0) {
      for (const level of bidLevels) {
        level.depthPercent = Math.round((level.cumulative / maxCumulative) * 10000) / 100;
      }
      for (const level of askLevels) {
        level.depthPercent = Math.round((level.cumulative / maxCumulative) * 10000) / 100;
      }
    }

    // Calculate spread
    const bestBid = bidLevels[0]?.price ?? 0;
    const bestAsk = askLevels[0]?.price ?? 0;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;
    const spreadPercent = midpoint > 0 ? spread / midpoint : 0;

    return {
      bids: bidLevels,
      asks: askLevels,
      spread,
      spreadPercent,
      midpoint,
      timestamp: Date.now(),
      lastUpdateId: this.lastId,
    };
  }

  private calculateCumulative(levels: { price: number; size: number }[]): PriceLevel[] {
    let cumulative = 0;
    return levels.map(({ price, size }) => {
      cumulative += size;
      return {
        price,
        size,
        cumulative,
        depthPercent: 0, // Will be set after max is known
      };
    });
  }

  get lastUpdateId(): number {
    return this.lastId;
  }

  get bidCount(): number {
    return this.bids.size;
  }

  get askCount(): number {
    return this.asks.size;
  }
}
