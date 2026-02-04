import { describe, it, expect } from 'vitest';
import { isBinanceDepthUpdate, isBinanceDepthSnapshot } from '../binance';

describe('isBinanceDepthUpdate', () => {
  it('accepts valid depth update', () => {
    expect(isBinanceDepthUpdate({
      e: 'depthUpdate',
      E: 1699900000000,
      s: 'BTCUSD',
      U: 100,
      u: 102,
      b: [['97500.00', '1.50']],
      a: [['97501.00', '1.20']],
    })).toBe(true);
  });

  it('rejects null', () => {
    expect(isBinanceDepthUpdate(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isBinanceDepthUpdate('string')).toBe(false);
    expect(isBinanceDepthUpdate(42)).toBe(false);
  });

  it('rejects wrong event type', () => {
    expect(isBinanceDepthUpdate({
      e: 'trade',
      E: 1699900000000,
      s: 'BTCUSD',
      U: 100,
      u: 102,
      b: [],
      a: [],
    })).toBe(false);
  });

  it('rejects missing required fields', () => {
    // Missing U
    expect(isBinanceDepthUpdate({
      e: 'depthUpdate',
      E: 1699900000000,
      s: 'BTCUSD',
      u: 102,
      b: [],
      a: [],
    })).toBe(false);

    // Missing b
    expect(isBinanceDepthUpdate({
      e: 'depthUpdate',
      E: 1699900000000,
      s: 'BTCUSD',
      U: 100,
      u: 102,
      a: [],
    })).toBe(false);
  });
});

describe('isBinanceDepthSnapshot', () => {
  it('accepts valid snapshot', () => {
    expect(isBinanceDepthSnapshot({
      lastUpdateId: 1027024,
      bids: [['97500.00', '1.50']],
      asks: [['97501.00', '1.20']],
    })).toBe(true);
  });

  it('rejects null', () => {
    expect(isBinanceDepthSnapshot(null)).toBe(false);
  });

  it('rejects missing lastUpdateId', () => {
    expect(isBinanceDepthSnapshot({
      bids: [],
      asks: [],
    })).toBe(false);
  });

  it('rejects non-array bids', () => {
    expect(isBinanceDepthSnapshot({
      lastUpdateId: 100,
      bids: 'not-an-array',
      asks: [],
    })).toBe(false);
  });

  it('rejects missing asks', () => {
    expect(isBinanceDepthSnapshot({
      lastUpdateId: 100,
      bids: [],
    })).toBe(false);
  });
});
