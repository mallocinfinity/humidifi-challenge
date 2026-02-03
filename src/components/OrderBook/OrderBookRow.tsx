// OrderBookRow component - Phase 4
// Displays single price level with depth bar via CSS custom property

import type { OrderBookRowProps } from '@/types';

// Format price with commas and 2 decimals
function formatPrice(price: number): string {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format size to reasonable precision
function formatSize(size: number): string {
  if (size >= 1) {
    return size.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  return size.toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

export function OrderBookRow({ level, side, maxCumulative }: OrderBookRowProps) {
  // Calculate depth percentage for the bar
  const depthWidth = maxCumulative > 0
    ? (level.cumulative / maxCumulative) * 100
    : 0;

  return (
    <div
      className={`orderbook-row row-${side}`}
      style={{ '--depth-width': depthWidth } as React.CSSProperties}
    >
      <span className="col-price">{formatPrice(level.price)}</span>
      <span className="col-size">{formatSize(level.size)}</span>
      <span className="col-cumulative">{formatSize(level.cumulative)}</span>
      <span className="col-depth">{level.depthPercent.toFixed(1)}%</span>
    </div>
  );
}
