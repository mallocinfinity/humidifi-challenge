// OrderBookRow component - Phase 5
// Memoized row with custom comparator for optimal re-renders

import { memo } from 'react';
import type { OrderBookRowProps } from '@/types';

// Cached formatters — Intl.NumberFormat is ~10x faster than toLocaleString
// because the locale/options are resolved once at module load, not per call.
const priceFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const size4Fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const size6Fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function formatPrice(price: number): string {
  return priceFmt.format(price);
}

function formatSize(size: number): string {
  return size >= 1 ? size4Fmt.format(size) : size6Fmt.format(size);
}

// Custom comparator: only re-render if displayed values actually changed
function arePropsEqual(prev: OrderBookRowProps, next: OrderBookRowProps): boolean {
  // Check level values that affect display
  if (prev.level.price !== next.level.price) return false;
  if (prev.level.size !== next.level.size) return false;
  if (prev.level.cumulative !== next.level.cumulative) return false;
  if (prev.level.depthPercent !== next.level.depthPercent) return false;

  // Only re-render for maxCumulative if it changed significantly (>1%)
  // Small changes in maxCumulative cause imperceptible depth bar differences
  if (prev.maxCumulative > 0 && next.maxCumulative > 0) {
    const percentChange = Math.abs(next.maxCumulative - prev.maxCumulative) / prev.maxCumulative;
    if (percentChange > 0.01) return false;
  } else if (prev.maxCumulative !== next.maxCumulative) {
    // Edge case: one is 0
    return false;
  }

  // Side is static, but check anyway
  if (prev.side !== next.side) return false;

  return true;
}

function OrderBookRowComponent({ level, side, maxCumulative }: OrderBookRowProps) {
  // Calculate depth percentage for the bar
  const depthScale = maxCumulative > 0
    ? Math.min(1, level.cumulative / maxCumulative)
    : 0;

  return (
    <div
      className={`orderbook-row row-${side}`}
      style={{ '--depth-scale': depthScale } as React.CSSProperties}
    >
      <span className="col-price">{formatPrice(level.price)}</span>
      <span className="col-size">{formatSize(level.size)}</span>
      <span className="col-cumulative">{formatSize(level.cumulative)}</span>
      <span className="col-depth">{level.depthPercent.toFixed(1)}%</span>
    </div>
  );
}

export const OrderBookRow = memo(OrderBookRowComponent, arePropsEqual);
