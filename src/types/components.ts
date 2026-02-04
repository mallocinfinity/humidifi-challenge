// ============================================================================
// COMPONENT PROPS TYPES
// ============================================================================

import type { PriceLevel } from './orderbook.ts';

/** Props for OrderBookRow component */
export interface OrderBookRowProps {
  level: PriceLevel;
  side: 'bid' | 'ask';
  maxCumulative: number;      // For depth bar calculation
}
