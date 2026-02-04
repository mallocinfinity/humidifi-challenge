// Sync mode detection - Phase 9/10
// SharedWorker (default when supported) vs BroadcastChannel (fallback / explicit)
// SAB mode: SharedArrayBuffer via SharedWorker (requires cross-origin isolation)

import { canUseSharedArrayBuffer } from './sab-detector';

export type SyncMode = 'shared' | 'broadcast' | 'sab';

export function detectSyncMode(): SyncMode {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  let result: SyncMode;

  if (mode === 'broadcast') {
    result = 'broadcast';
  } else if (mode === 'shared') {
    result = 'shared';
  } else if (mode === 'sab' && canUseSharedArrayBuffer()) {
    result = 'sab';
  } else if (mode === 'sab') {
    // SAB requested but not available — log why
    console.warn('[sync-mode] SAB requested but not available:', {
      SharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      crossOriginIsolated: globalThis.crossOriginIsolated,
    });
    result = typeof SharedWorker !== 'undefined' ? 'shared' : 'broadcast';
  } else {
    // Default: SharedWorker if supported, else BroadcastChannel
    result = typeof SharedWorker !== 'undefined' ? 'shared' : 'broadcast';
  }

  console.log('[sync-mode] detectSyncMode():', result, {
    urlMode: mode,
    canSAB: canUseSharedArrayBuffer(),
    crossOriginIsolated: globalThis.crossOriginIsolated,
  });

  return result;
}
