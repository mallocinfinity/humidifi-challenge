// Binary protocol for SharedArrayBuffer orderbook transport
// Encodes/decodes OrderbookSlice to a fixed-layout SharedArrayBuffer.
// Version field uses Atomics for lock-free signaling between worker and main thread.

import type { OrderbookSlice, PriceLevel } from '@/types';

// ─── Buffer layout ────────────────────────────────────────────────────────────
//
//  Offset  Bytes  Type      Field
//  ------  -----  --------  -----
//  0       4      Int32     version (Atomics — native endian via Int32Array)
//  4       4      Int32     bidCount
//  8       4      Int32     askCount
//  12      4      —         (padding for Float64 alignment)
//  16      8      Float64   spread
//  24      8      Float64   spreadPercent
//  32      8      Float64   midpoint
//  40      8      Float64   timestamp
//  48      8      Float64   lastUpdateId
//  ─── header: 56 bytes ───
//  56      480    Float64×4×15  bids  (price, size, cumulative, depthPercent)
//  536     480    Float64×4×15  asks
//  ─── total: 1016 bytes (buffer sized to 2048 for headroom) ───

export const BUFFER_SIZE = 2048;
export const MAX_DEPTH = 15;

// Header offsets
export const VERSION_OFFSET = 0;          // Int32 — Atomics only
export const BID_COUNT_OFFSET = 4;        // Int32
export const ASK_COUNT_OFFSET = 8;        // Int32
// 12: padding
export const SPREAD_OFFSET = 16;          // Float64
export const SPREAD_PCT_OFFSET = 24;      // Float64
export const MIDPOINT_OFFSET = 32;        // Float64
export const TIMESTAMP_OFFSET = 40;       // Float64
export const LAST_UPDATE_ID_OFFSET = 48;  // Float64

export const HEADER_SIZE = 56;

// Level data: 4 × Float64 = 32 bytes per level
export const LEVEL_STRIDE = 32;
export const BIDS_OFFSET = HEADER_SIZE;                            // 56
export const ASKS_OFFSET = HEADER_SIZE + MAX_DEPTH * LEVEL_STRIDE; // 536

// ─── Encode (worker writes to SAB) ───────────────────────────────────────────

export function encodeOrderbookSlice(slice: OrderbookSlice, buffer: SharedArrayBuffer): void {
  const view = new DataView(buffer);

  // Write counts (little-endian to match platform native for Int32Array consistency)
  view.setInt32(BID_COUNT_OFFSET, slice.bids.length, true);
  view.setInt32(ASK_COUNT_OFFSET, slice.asks.length, true);

  // Write header floats
  view.setFloat64(SPREAD_OFFSET, slice.spread, true);
  view.setFloat64(SPREAD_PCT_OFFSET, slice.spreadPercent, true);
  view.setFloat64(MIDPOINT_OFFSET, slice.midpoint, true);
  view.setFloat64(TIMESTAMP_OFFSET, slice.timestamp, true);
  view.setFloat64(LAST_UPDATE_ID_OFFSET, slice.lastUpdateId, true);

  // Write bid levels
  let offset = BIDS_OFFSET;
  for (let i = 0; i < slice.bids.length; i++) {
    const level = slice.bids[i];
    view.setFloat64(offset, level.price, true);
    view.setFloat64(offset + 8, level.size, true);
    view.setFloat64(offset + 16, level.cumulative, true);
    view.setFloat64(offset + 24, level.depthPercent, true);
    offset += LEVEL_STRIDE;
  }

  // Write ask levels
  offset = ASKS_OFFSET;
  for (let i = 0; i < slice.asks.length; i++) {
    const level = slice.asks[i];
    view.setFloat64(offset, level.price, true);
    view.setFloat64(offset + 8, level.size, true);
    view.setFloat64(offset + 16, level.cumulative, true);
    view.setFloat64(offset + 24, level.depthPercent, true);
    offset += LEVEL_STRIDE;
  }

  // Increment version LAST — Atomics.store acts as a release fence,
  // guaranteeing all prior writes are visible before the version bump.
  const versionView = new Int32Array(buffer, VERSION_OFFSET, 1);
  Atomics.store(versionView, 0, Atomics.load(versionView, 0) + 1);
}

// ─── Decode (main thread reads from SAB) ─────────────────────────────────────

export function decodeOrderbookSlice(buffer: SharedArrayBuffer): OrderbookSlice {
  const view = new DataView(buffer);

  const bidCount = view.getInt32(BID_COUNT_OFFSET, true);
  const askCount = view.getInt32(ASK_COUNT_OFFSET, true);

  // Read bid levels
  const bids: PriceLevel[] = new Array(bidCount);
  let offset = BIDS_OFFSET;
  for (let i = 0; i < bidCount; i++) {
    bids[i] = {
      price: view.getFloat64(offset, true),
      size: view.getFloat64(offset + 8, true),
      cumulative: view.getFloat64(offset + 16, true),
      depthPercent: view.getFloat64(offset + 24, true),
    };
    offset += LEVEL_STRIDE;
  }

  // Read ask levels
  const asks: PriceLevel[] = new Array(askCount);
  offset = ASKS_OFFSET;
  for (let i = 0; i < askCount; i++) {
    asks[i] = {
      price: view.getFloat64(offset, true),
      size: view.getFloat64(offset + 8, true),
      cumulative: view.getFloat64(offset + 16, true),
      depthPercent: view.getFloat64(offset + 24, true),
    };
    offset += LEVEL_STRIDE;
  }

  return {
    bids,
    asks,
    spread: view.getFloat64(SPREAD_OFFSET, true),
    spreadPercent: view.getFloat64(SPREAD_PCT_OFFSET, true),
    midpoint: view.getFloat64(MIDPOINT_OFFSET, true),
    timestamp: view.getFloat64(TIMESTAMP_OFFSET, true),
    lastUpdateId: view.getFloat64(LAST_UPDATE_ID_OFFSET, true),
  };
}

// ─── Version helpers ──────────────────────────────────────────────────────────

export function readVersion(buffer: SharedArrayBuffer): number {
  const versionView = new Int32Array(buffer, VERSION_OFFSET, 1);
  return Atomics.load(versionView, 0);
}

// ─── Cached reader (main thread — zero per-frame allocation) ─────────────────
//
// Caches DataView + Int32Array for the SAB lifetime.
// readVersion() and decode() allocate nothing except the returned OrderbookSlice
// (which React/Zustand needs as a fresh reference for change detection).

export class SABReader {
  private readonly dv: DataView;
  private readonly ver: Int32Array;
  // Pre-allocated pools — mutated in place, zero PriceLevel allocation per frame.
  private readonly bidPool: PriceLevel[];
  private readonly askPool: PriceLevel[];

  constructor(buffer: SharedArrayBuffer) {
    this.dv = new DataView(buffer);
    this.ver = new Int32Array(buffer, VERSION_OFFSET, 1);
    this.bidPool = Array.from({ length: MAX_DEPTH }, () => ({ price: 0, size: 0, cumulative: 0, depthPercent: 0 }));
    this.askPool = Array.from({ length: MAX_DEPTH }, () => ({ price: 0, size: 0, cumulative: 0, depthPercent: 0 }));
  }

  readVersion(): number {
    return Atomics.load(this.ver, 0);
  }

  // 3 allocations per call (1 slice object + 2 array.slice) instead of 33.
  // PriceLevel objects are mutated in place from the pre-allocated pool.
  decode(): OrderbookSlice {
    const v = this.dv;
    const bidCount = Math.min(v.getInt32(BID_COUNT_OFFSET, true), MAX_DEPTH);
    const askCount = Math.min(v.getInt32(ASK_COUNT_OFFSET, true), MAX_DEPTH);

    let off = BIDS_OFFSET;
    for (let i = 0; i < bidCount; i++) {
      const level = this.bidPool[i];
      level.price = v.getFloat64(off, true);
      level.size = v.getFloat64(off + 8, true);
      level.cumulative = v.getFloat64(off + 16, true);
      level.depthPercent = v.getFloat64(off + 24, true);
      off += LEVEL_STRIDE;
    }

    off = ASKS_OFFSET;
    for (let i = 0; i < askCount; i++) {
      const level = this.askPool[i];
      level.price = v.getFloat64(off, true);
      level.size = v.getFloat64(off + 8, true);
      level.cumulative = v.getFloat64(off + 16, true);
      level.depthPercent = v.getFloat64(off + 24, true);
      off += LEVEL_STRIDE;
    }

    return {
      bids: this.bidPool.slice(0, bidCount),
      asks: this.askPool.slice(0, askCount),
      spread: v.getFloat64(SPREAD_OFFSET, true),
      spreadPercent: v.getFloat64(SPREAD_PCT_OFFSET, true),
      midpoint: v.getFloat64(MIDPOINT_OFFSET, true),
      timestamp: v.getFloat64(TIMESTAMP_OFFSET, true),
      lastUpdateId: v.getFloat64(LAST_UPDATE_ID_OFFSET, true),
    };
  }
}

// ─── Cached writer (worker thread — zero per-encode allocation) ──────────────

export class SABWriter {
  private readonly dv: DataView;
  private readonly ver: Int32Array;

  constructor(buffer: SharedArrayBuffer) {
    this.dv = new DataView(buffer);
    this.ver = new Int32Array(buffer, VERSION_OFFSET, 1);
  }

  encode(slice: OrderbookSlice): void {
    const v = this.dv;

    v.setInt32(BID_COUNT_OFFSET, slice.bids.length, true);
    v.setInt32(ASK_COUNT_OFFSET, slice.asks.length, true);

    v.setFloat64(SPREAD_OFFSET, slice.spread, true);
    v.setFloat64(SPREAD_PCT_OFFSET, slice.spreadPercent, true);
    v.setFloat64(MIDPOINT_OFFSET, slice.midpoint, true);
    v.setFloat64(TIMESTAMP_OFFSET, slice.timestamp, true);
    v.setFloat64(LAST_UPDATE_ID_OFFSET, slice.lastUpdateId, true);

    let off = BIDS_OFFSET;
    for (let i = 0; i < slice.bids.length; i++) {
      const level = slice.bids[i];
      v.setFloat64(off, level.price, true);
      v.setFloat64(off + 8, level.size, true);
      v.setFloat64(off + 16, level.cumulative, true);
      v.setFloat64(off + 24, level.depthPercent, true);
      off += LEVEL_STRIDE;
    }

    off = ASKS_OFFSET;
    for (let i = 0; i < slice.asks.length; i++) {
      const level = slice.asks[i];
      v.setFloat64(off, level.price, true);
      v.setFloat64(off + 8, level.size, true);
      v.setFloat64(off + 16, level.cumulative, true);
      v.setFloat64(off + 24, level.depthPercent, true);
      off += LEVEL_STRIDE;
    }

    // Release fence — all writes above become visible before version bump
    Atomics.store(this.ver, 0, Atomics.load(this.ver, 0) + 1);
  }
}
