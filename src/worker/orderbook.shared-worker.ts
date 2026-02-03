// Shared Worker - Phase 9
// This file will be loaded as a SharedWorker

import type { WorkerToMainMessage } from '@/types';

// Type declarations for shared worker context
declare const self: SharedWorkerGlobalScope;

// Connected ports
const ports: MessagePort[] = [];

// Connection handler stub
self.onconnect = (_event: MessageEvent): void => {
  // Will be implemented in Phase 9
  void ports;
};

// Helper to broadcast to all ports
export function broadcast(_message: WorkerToMainMessage): void {
  // Will be implemented in Phase 9
}
