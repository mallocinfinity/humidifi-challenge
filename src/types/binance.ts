// ============================================================================
// BINANCE API TYPES
// ============================================================================

/** Binance WebSocket depth update message */
export interface BinanceDepthUpdate {
  e: 'depthUpdate';           // Event type
  E: number;                  // Event time (ms)
  s: string;                  // Symbol (e.g., "BTCUSD")
  U: number;                  // First update ID in event
  u: number;                  // Final update ID in event
  b: [string, string][];      // Bids [price, quantity][]
  a: [string, string][];      // Asks [price, quantity][]
}

/** Binance REST depth snapshot response */
export interface BinanceDepthSnapshot {
  lastUpdateId: number;
  bids: [string, string][];   // [price, quantity][]
  asks: [string, string][];   // [price, quantity][]
}

/** Type guard for BinanceDepthUpdate */
export function isBinanceDepthUpdate(data: unknown): data is BinanceDepthUpdate {
  return (
    typeof data === 'object' &&
    data !== null &&
    'e' in data &&
    (data as BinanceDepthUpdate).e === 'depthUpdate' &&
    'U' in data &&
    'u' in data &&
    'b' in data &&
    'a' in data
  );
}

/** Type guard for BinanceDepthSnapshot */
export function isBinanceDepthSnapshot(data: unknown): data is BinanceDepthSnapshot {
  return (
    typeof data === 'object' &&
    data !== null &&
    'lastUpdateId' in data &&
    'bids' in data &&
    'asks' in data &&
    Array.isArray((data as BinanceDepthSnapshot).bids) &&
    Array.isArray((data as BinanceDepthSnapshot).asks)
  );
}
