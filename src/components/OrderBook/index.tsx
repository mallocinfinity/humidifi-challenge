// OrderBook container component - Phase 4
// Displays 15 asks, spread, 15 bids with depth bars

import { useOrderbookBids, useOrderbookAsks, useMaxCumulative } from '@/hooks';
import { OrderBookRow } from './OrderBookRow';
import { Spread } from './Spread';
import './OrderBook.css';

export function OrderBook() {
  const bids = useOrderbookBids();
  const asks = useOrderbookAsks();
  const maxCumulative = useMaxCumulative();

  return (
    <div className="orderbook">
      <div className="orderbook-header">
        <span>Price (USD)</span>
        <span>Size (BTC)</span>
        <span>Cumulative</span>
        <span>Depth</span>
      </div>

      {/* Asks (sells) - displayed in reverse so best ask is at bottom */}
      <div className="orderbook-asks">
        {asks.map((level, index) => (
          <OrderBookRow
            key={index}
            level={level}
            side="ask"
            maxCumulative={maxCumulative}
          />
        ))}
      </div>

      {/* Spread indicator */}
      <Spread />

      {/* Bids (buys) - best bid at top */}
      <div className="orderbook-bids">
        {bids.map((level, index) => (
          <OrderBookRow
            key={index}
            level={level}
            side="bid"
            maxCumulative={maxCumulative}
          />
        ))}
      </div>
    </div>
  );
}
