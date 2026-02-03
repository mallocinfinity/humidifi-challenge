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

/** Props for OrderBook component */
export interface OrderBookProps {
  // No props - reads from store via hooks
}

/** Props for MetricsPanel component */
export interface MetricsPanelProps {
  // No props - reads from store via hooks
}

/** Props for Controls component */
export interface ControlsProps {
  // No props - reads from store via hooks
}

/** Props for StatusIndicator component */
export interface StatusIndicatorProps {
  // No props - reads from store via hooks
}

/** Props for Spread component */
export interface SpreadProps {
  // No props - reads from store via hooks
}

/** Props for DepthBar component */
export interface DepthBarProps {
  percent: number;            // 0-100
  side: 'bid' | 'ask';
}
