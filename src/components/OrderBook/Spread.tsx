// Spread component - Phase 4
// Displays spread between best bid and best ask

import { useSpread } from '@/hooks';

export function Spread() {
  const spread = useSpread();

  if (!spread) {
    return (
      <div className="spread-row">
        <span className="spread-label">Spread</span>
        <span className="spread-value">--</span>
      </div>
    );
  }

  return (
    <div className="spread-row">
      <span className="spread-label">Spread</span>
      <span className="spread-value">
        ${spread.spread.toFixed(2)}
      </span>
      <span className="spread-percent">
        ({(spread.spreadPercent * 100).toFixed(4)}%)
      </span>
    </div>
  );
}
