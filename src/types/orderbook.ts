// ============================================================================
// INTERNAL ORDERBOOK TYPES
// ============================================================================

/** Single price level in the orderbook */
export interface PriceLevel {
  price: number;
  size: number;
  cumulative: number;         // Running total from best price
  depthPercent: number;       // 0-100, relative to max cumulative
}

/** Processed orderbook slice ready for UI */
export interface OrderbookSlice {
  bids: PriceLevel[];         // Top 15, sorted best (highest) to worst
  asks: PriceLevel[];         // Top 15, sorted best (lowest) to worst
  spread: number;             // Best ask - best bid
  spreadPercent: number;      // (spread / midpoint) * 100
  midpoint: number;           // (bestBid + bestAsk) / 2
  timestamp: number;          // When this slice was created
  lastUpdateId: number;       // Binance sequence ID
}

/** Connection status */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'syncing'                 // Fetching initial snapshot
  | 'connected'
  | 'reconnecting'
  | 'error';
