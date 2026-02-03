// Dedicated Worker - Phase 1/2
// This file will be loaded as a Web Worker

import type { MainToWorkerMessage, WorkerToMainMessage } from '@/types';

// Type declarations for worker context
declare const self: DedicatedWorkerGlobalScope;

// Message handler stub
self.onmessage = (_event: MessageEvent<MainToWorkerMessage>): void => {
  // Will be implemented in Phase 1
};

// Helper to post typed messages
export function postMessage(_message: WorkerToMainMessage): void {
  // Will be implemented in Phase 1
}
