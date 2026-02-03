import { memo } from 'react';
import type { DepthBarProps } from '@/types';

function DepthBarComponent(_props: DepthBarProps) {
  return <div className="depth-bar" />;
}

export const DepthBar = memo(DepthBarComponent);
