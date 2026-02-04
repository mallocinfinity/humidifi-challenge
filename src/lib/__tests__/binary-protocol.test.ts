import { describe, it, expect } from 'vitest';
import {
  BUFFER_SIZE,
  MAX_DEPTH,
  SABWriter,
  SABReader,
  encodeOrderbookSlice,
  decodeOrderbookSlice,
  readVersion,
} from '../binary-protocol';
import type { OrderbookSlice } from '@/types';

function makeSlice(bidCount: number, askCount: number): OrderbookSlice {
  const bids = Array.from({ length: bidCount }, (_, i) => ({
    price: 97500 - i * 0.5,
    size: 1.5 + i * 0.1,
    cumulative: 0,
    depthPercent: 0,
  }));
  let cum = 0;
  for (const b of bids) {
    cum += b.size;
    b.cumulative = cum;
    b.depthPercent = cum * 2;
  }

  const asks = Array.from({ length: askCount }, (_, i) => ({
    price: 97500.5 + i * 0.5,
    size: 1.2 + i * 0.1,
    cumulative: 0,
    depthPercent: 0,
  }));
  cum = 0;
  for (const a of asks) {
    cum += a.size;
    a.cumulative = cum;
    a.depthPercent = cum * 2;
  }

  return {
    bids,
    asks,
    spread: 0.5,
    spreadPercent: 0.0000051,
    midpoint: 97500.25,
    timestamp: 1700000000000,
    lastUpdateId: 1027024,
  };
}

describe('binary-protocol standalone functions', () => {
  it('roundtrips encode/decode with exact Float64 values', () => {
    const original = makeSlice(15, 15);
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);

    encodeOrderbookSlice(original, buffer);
    const decoded = decodeOrderbookSlice(buffer);

    expect(decoded.spread).toBe(original.spread);
    expect(decoded.spreadPercent).toBe(original.spreadPercent);
    expect(decoded.midpoint).toBe(original.midpoint);
    expect(decoded.timestamp).toBe(original.timestamp);
    expect(decoded.lastUpdateId).toBe(original.lastUpdateId);
    expect(decoded.bids.length).toBe(15);
    expect(decoded.asks.length).toBe(15);

    for (let i = 0; i < 15; i++) {
      expect(decoded.bids[i].price).toBe(original.bids[i].price);
      expect(decoded.bids[i].size).toBe(original.bids[i].size);
      expect(decoded.bids[i].cumulative).toBe(original.bids[i].cumulative);
      expect(decoded.bids[i].depthPercent).toBe(original.bids[i].depthPercent);
    }

    for (let i = 0; i < 15; i++) {
      expect(decoded.asks[i].price).toBe(original.asks[i].price);
      expect(decoded.asks[i].size).toBe(original.asks[i].size);
    }
  });

  it('handles 0 bids and 0 asks', () => {
    const original = makeSlice(0, 0);
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);

    encodeOrderbookSlice(original, buffer);
    const decoded = decodeOrderbookSlice(buffer);

    expect(decoded.bids.length).toBe(0);
    expect(decoded.asks.length).toBe(0);
    expect(decoded.spread).toBe(0.5);
  });

  it('version counter increments on each encode', () => {
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);
    const slice = makeSlice(5, 5);

    expect(readVersion(buffer)).toBe(0);
    encodeOrderbookSlice(slice, buffer);
    expect(readVersion(buffer)).toBe(1);
    encodeOrderbookSlice(slice, buffer);
    expect(readVersion(buffer)).toBe(2);
  });
});

describe('SABWriter / SABReader', () => {
  it('roundtrips via cached classes with exact values', () => {
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);
    const writer = new SABWriter(buffer);
    const reader = new SABReader(buffer);

    const original = makeSlice(15, 15);
    writer.encode(original);

    expect(reader.readVersion()).toBe(1);
    const decoded = reader.decode();

    expect(decoded.bids.length).toBe(15);
    expect(decoded.asks.length).toBe(15);
    expect(decoded.spread).toBe(original.spread);
    expect(decoded.midpoint).toBe(original.midpoint);

    for (let i = 0; i < 15; i++) {
      expect(decoded.bids[i].price).toBe(original.bids[i].price);
      expect(decoded.bids[i].size).toBe(original.bids[i].size);
    }
  });

  it('handles partial depth (fewer than MAX_DEPTH levels)', () => {
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);
    const writer = new SABWriter(buffer);
    const reader = new SABReader(buffer);

    const original = makeSlice(3, 7);
    writer.encode(original);
    const decoded = reader.decode();

    expect(decoded.bids.length).toBe(3);
    expect(decoded.asks.length).toBe(7);
  });

  it('handles 0 bids and 0 asks', () => {
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);
    const writer = new SABWriter(buffer);
    const reader = new SABReader(buffer);

    writer.encode(makeSlice(0, 0));
    const decoded = reader.decode();

    expect(decoded.bids.length).toBe(0);
    expect(decoded.asks.length).toBe(0);
  });

  it('SABReader.decode() clamps bidCount/askCount to MAX_DEPTH', () => {
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);
    const writer = new SABWriter(buffer);
    const reader = new SABReader(buffer);

    // Write valid data first
    writer.encode(makeSlice(15, 15));

    // Corrupt bidCount to exceed MAX_DEPTH
    const dv = new DataView(buffer);
    dv.setInt32(4, 100, true); // bidCount = 100

    const decoded = reader.decode();
    expect(decoded.bids.length).toBe(MAX_DEPTH);
  });

  it('version increments on each encode via SABWriter', () => {
    const buffer = new SharedArrayBuffer(BUFFER_SIZE);
    const writer = new SABWriter(buffer);
    const reader = new SABReader(buffer);

    expect(reader.readVersion()).toBe(0);
    writer.encode(makeSlice(5, 5));
    expect(reader.readVersion()).toBe(1);
    writer.encode(makeSlice(5, 5));
    expect(reader.readVersion()).toBe(2);
  });
});
