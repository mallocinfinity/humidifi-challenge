import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SequenceManager, type SequenceManagerCallbacks } from '../sequence-manager';
import type { BinanceDepthUpdate, BinanceDepthSnapshot } from '@/types';

function makeUpdate(U: number, u: number): BinanceDepthUpdate {
  return {
    e: 'depthUpdate',
    E: Date.now(),
    s: 'BTCUSD',
    U,
    u,
    b: [['97500.00', '1.50']],
    a: [['97501.00', '1.20']],
  };
}

function makeSnapshot(lastUpdateId: number): BinanceDepthSnapshot {
  return {
    lastUpdateId,
    bids: [['97500.00', '1.50'], ['97499.50', '0.75']],
    asks: [['97501.00', '1.20'], ['97501.50', '2.40']],
  };
}

function makeCallbacks(): SequenceManagerCallbacks & {
  states: string[];
  updates: BinanceDepthUpdate[];
  syncs: number;
  gaps: number;
} {
  const result = {
    states: [] as string[],
    updates: [] as BinanceDepthUpdate[],
    syncs: 0,
    gaps: 0,
    onStateChange: vi.fn((state: string) => { result.states.push(state); }),
    onSynchronized: vi.fn(() => { result.syncs++; }),
    onUpdate: vi.fn((update: BinanceDepthUpdate) => { result.updates.push(update); }),
    onSequenceGap: vi.fn(() => { result.gaps++; }),
  };
  return result;
}

describe('SequenceManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in buffering state', () => {
    const cb = makeCallbacks();
    const sm = new SequenceManager('BTCUSD', 'https://api.binance.us/api/v3/depth', cb);
    expect(sm.state).toBe('buffering');
  });

  it('transitions buffering → syncing on first message', () => {
    const cb = makeCallbacks();
    const sm = new SequenceManager('BTCUSD', 'https://api.binance.us/api/v3/depth', cb);

    // Mock fetch to prevent actual HTTP call
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})); // never resolves

    sm.handleMessage(makeUpdate(100, 102));
    expect(cb.states).toContain('syncing');
  });

  describe('validateSequence (via handleMessage in synchronized state)', () => {
    // We need to get the manager into synchronized state first.
    // We'll do this by directly testing the public interface.

    // Snapshot lastUpdateId must overlap with the first buffered message's [U, u] range
    // or processSnapshot considers it too old and refetches.
    function makeSynchronized(lastUpdateId: number) {
      const cb = makeCallbacks();
      const sm = new SequenceManager('BTCUSD', 'https://api.binance.us/api/v3/depth', cb);

      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeSnapshot(lastUpdateId)),
        } as Response)
      );

      return { sm, cb };
    }

    it('accepts contiguous updates', async () => {
      // Snapshot lastUpdateId=1002 overlaps first update [1001, 1003]
      const { sm, cb } = makeSynchronized(1002);

      sm.handleMessage(makeUpdate(1001, 1003));
      await vi.waitFor(() => expect(sm.state).toBe('synchronized'));

      // Contiguous: next U=1004 = lastUpdateId(1003)+1
      sm.handleMessage(makeUpdate(1004, 1006));
      expect(cb.updates.length).toBe(1);
      expect(cb.gaps).toBe(0);
    });

    it('accepts overlapping updates', async () => {
      const { sm, cb } = makeSynchronized(1004);

      sm.handleMessage(makeUpdate(1001, 1005));
      await vi.waitFor(() => expect(sm.state).toBe('synchronized'));

      // Overlapping — U(1004) <= lastUpdateId(1005)+1
      sm.handleMessage(makeUpdate(1004, 1008));
      expect(cb.updates.length).toBe(1);
      expect(cb.gaps).toBe(0);
    });

    it('tolerates small gaps (≤1000)', async () => {
      const { sm, cb } = makeSynchronized(1002);

      sm.handleMessage(makeUpdate(1001, 1003));
      await vi.waitFor(() => expect(sm.state).toBe('synchronized'));

      // Small gap: expected U=1004, got 1504 (gap=500)
      sm.handleMessage(makeUpdate(1504, 1506));
      expect(cb.updates.length).toBe(1);
      expect(cb.gaps).toBe(0);
    });

    it('resyncs on large gaps (>1000)', async () => {
      const { sm, cb } = makeSynchronized(1002);

      sm.handleMessage(makeUpdate(1001, 1003));
      await vi.waitFor(() => expect(sm.state).toBe('synchronized'));

      // Large gap: expected U=1004, got 3005 (gap=2001)
      sm.handleMessage(makeUpdate(3005, 3007));
      expect(cb.gaps).toBe(1);
      // After gap detection, reset to buffering then immediately reprocess → syncing
      expect(sm.state).toBe('syncing');
    });
  });

  it('reset() aborts in-flight fetch', () => {
    const cb = makeCallbacks();
    const sm = new SequenceManager('BTCUSD', 'https://api.binance.us/api/v3/depth', cb);

    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));

    sm.handleMessage(makeUpdate(100, 102));
    sm.reset();

    expect(sm.state).toBe('buffering');
  });
});
