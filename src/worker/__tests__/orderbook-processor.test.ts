import { describe, it, expect } from 'vitest';
import { OrderbookProcessor } from '../orderbook-processor';
import type { BinanceDepthSnapshot, BinanceDepthUpdate } from '@/types';
import snapshot from '../../../__tests__/fixtures/binance-depth-snapshot.json';
import update from '../../../__tests__/fixtures/binance-depth-update.json';

describe('OrderbookProcessor', () => {
  describe('applySnapshot', () => {
    it('creates sorted bids (descending) and asks (ascending)', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      const slice = proc.getSlice();

      // Bids: highest price first
      for (let i = 1; i < slice.bids.length; i++) {
        expect(slice.bids[i - 1].price).toBeGreaterThan(slice.bids[i].price);
      }

      // Asks: lowest price first
      for (let i = 1; i < slice.asks.length; i++) {
        expect(slice.asks[i - 1].price).toBeLessThan(slice.asks[i].price);
      }
    });

    it('limits to 15 levels', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      const slice = proc.getSlice();
      expect(slice.bids.length).toBe(15);
      expect(slice.asks.length).toBe(15);
    });

    it('calculates cumulative sums correctly', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      const slice = proc.getSlice();

      // Verify cumulative is monotonically increasing
      for (let i = 1; i < slice.bids.length; i++) {
        expect(slice.bids[i].cumulative).toBeGreaterThan(slice.bids[i - 1].cumulative);
      }
      for (let i = 1; i < slice.asks.length; i++) {
        expect(slice.asks[i].cumulative).toBeGreaterThan(slice.asks[i - 1].cumulative);
      }

      // Verify cumulative[0] === size[0]
      expect(slice.bids[0].cumulative).toBe(slice.bids[0].size);
      expect(slice.asks[0].cumulative).toBe(slice.asks[0].size);
    });

    it('calculates spread and midpoint', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      const slice = proc.getSlice();

      // Best bid: 97500.00, best ask: 97500.50
      expect(slice.spread).toBeCloseTo(0.5, 2);
      expect(slice.midpoint).toBeCloseTo(97500.25, 2);
      expect(slice.spreadPercent).toBeGreaterThan(0);
    });
  });

  describe('applyDelta', () => {
    it('updates existing price levels', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      proc.applyDelta(update as BinanceDepthUpdate);
      const slice = proc.getSlice();

      // The update changes bid 97500.00 from 1.50 to 1.75
      const bid97500 = slice.bids.find(b => b.price === 97500);
      expect(bid97500?.size).toBe(1.75);
    });

    it('removes levels with quantity 0', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      const sliceBefore = proc.getSlice();
      const had99_50bid = sliceBefore.bids.some(b => b.price === 97499.5);
      expect(had99_50bid).toBe(true);

      proc.applyDelta(update as BinanceDepthUpdate);
      const sliceAfter = proc.getSlice();

      // The update sets bid 97499.50 qty to 0 → removed
      const bid99_50 = sliceAfter.bids.find(b => b.price === 97499.5);
      expect(bid99_50).toBeUndefined();

      // The update sets ask 97501.00 qty to 0 → removed
      const ask101 = sliceAfter.asks.find(a => a.price === 97501);
      expect(ask101).toBeUndefined();
    });

    it('tracks lastUpdateId', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);
      expect(proc.lastUpdateId).toBe(1027024);

      proc.applyDelta(update as BinanceDepthUpdate);
      expect(proc.lastUpdateId).toBe(1027027);
    });
  });

  describe('NaN guard', () => {
    it('skips NaN price/quantity in snapshot', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot({
        lastUpdateId: 100,
        bids: [['97500.00', '1.50'], ['invalid', '1.00'], ['97499.00', 'bad']],
        asks: [['97501.00', '1.20']],
      });

      const slice = proc.getSlice();
      // Only the valid bid should exist
      expect(slice.bids.length).toBe(1);
      expect(slice.bids[0].price).toBe(97500);
    });

    it('skips NaN price/quantity in delta', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot({
        lastUpdateId: 100,
        bids: [['97500.00', '1.50']],
        asks: [['97501.00', '1.20']],
      });

      proc.applyDelta({
        e: 'depthUpdate',
        E: Date.now(),
        s: 'BTCUSD',
        U: 101,
        u: 102,
        b: [['invalid', '2.00']],
        a: [['97501.00', 'NaN']],
      });

      const slice = proc.getSlice();
      // Original bid unchanged
      expect(slice.bids[0].size).toBe(1.5);
      // Original ask unchanged
      expect(slice.asks[0].size).toBe(1.2);
    });
  });

  describe('depthPercent', () => {
    it('depth percentages are relative to max cumulative', () => {
      const proc = new OrderbookProcessor();
      proc.applySnapshot(snapshot as BinanceDepthSnapshot);

      const slice = proc.getSlice();

      // Last level should have highest cumulative, and either bids or asks
      // last level should have depthPercent = 100
      const maxBidCum = slice.bids[slice.bids.length - 1].cumulative;
      const maxAskCum = slice.asks[slice.asks.length - 1].cumulative;

      // The side with the higher cumulative should have 100% depth at last level
      if (maxBidCum >= maxAskCum) {
        expect(slice.bids[slice.bids.length - 1].depthPercent).toBeCloseTo(100, 0);
      } else {
        expect(slice.asks[slice.asks.length - 1].depthPercent).toBeCloseTo(100, 0);
      }

      // All depthPercent values should be > 0 and <= 100
      for (const level of [...slice.bids, ...slice.asks]) {
        expect(level.depthPercent).toBeGreaterThan(0);
        expect(level.depthPercent).toBeLessThanOrEqual(100.01);
      }
    });
  });
});
