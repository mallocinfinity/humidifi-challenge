import { memo } from 'react';
import type { SpreadProps } from '@/types';

function SpreadComponent(_props: SpreadProps) {
  return <div className="spread">Spread placeholder</div>;
}

export const Spread = memo(SpreadComponent);
