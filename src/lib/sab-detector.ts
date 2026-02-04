// SharedArrayBuffer feature detection
// Requires both the API and cross-origin isolation (COOP/COEP headers).

export function canUseSharedArrayBuffer(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof globalThis.crossOriginIsolated === 'boolean' &&
    globalThis.crossOriginIsolated === true
  );
}
