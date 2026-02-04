// Sync mode detection - Phase 9
// SharedWorker (default when supported) vs BroadcastChannel (fallback / explicit)

export type SyncMode = 'shared' | 'broadcast';

export function detectSyncMode(): SyncMode {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'broadcast') return 'broadcast';
  if (mode === 'shared') return 'shared';

  // Default: SharedWorker if supported, else BroadcastChannel
  return typeof SharedWorker !== 'undefined' ? 'shared' : 'broadcast';
}
