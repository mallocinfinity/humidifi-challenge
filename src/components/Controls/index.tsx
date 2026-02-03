// Controls component - Phase 7
// Freeze/unfreeze toggle

import { useCallback } from 'react';
import { useFrozenState, useFreezeActions } from '@/hooks';
import './Controls.css';

export function Controls() {
  const { isFrozen } = useFrozenState();
  const { freeze, unfreeze } = useFreezeActions();

  const handleToggle = useCallback(() => {
    if (isFrozen) {
      unfreeze();
    } else {
      freeze();
    }
  }, [isFrozen, freeze, unfreeze]);

  return (
    <div className="controls">
      <button
        className={`freeze-btn ${isFrozen ? 'frozen' : ''}`}
        onClick={handleToggle}
      >
        {isFrozen ? 'Unfreeze' : 'Freeze'}
      </button>
      {isFrozen && <span className="frozen-badge">PAUSED</span>}
    </div>
  );
}
