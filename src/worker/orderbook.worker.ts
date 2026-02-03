// Dedicated Worker - Phase 2
// Real Binance WebSocket with sequence handling

import type { MainToWorkerMessage, WorkerToMainMessage, BinanceDepthUpdate, BinanceDepthSnapshot } from '@/types';
import { BinanceWebSocket } from './binance-ws.ts';
import { SequenceManager, type SequenceState } from './sequence-manager.ts';
import { OrderbookProcessor } from './orderbook-processor.ts';

declare const self: DedicatedWorkerGlobalScope;

let binanceWS: BinanceWebSocket | null = null;
let sequenceManager: SequenceManager | null = null;
let orderbookProcessor: OrderbookProcessor | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;

// Post typed message to main thread
function postTypedMessage(message: WorkerToMainMessage): void {
  self.postMessage(message);
}

// Map sequence state to connection status
function mapSequenceState(state: SequenceState): 'syncing' | 'connected' {
  switch (state) {
    case 'buffering':
    case 'syncing':
    case 'resyncing':
      return 'syncing';
    case 'synchronized':
      return 'connected';
  }
}

// Handle synchronized state - apply snapshot and buffered updates
function handleSynchronized(snapshot: BinanceDepthSnapshot, bufferedUpdates: BinanceDepthUpdate[]): void {
  if (!orderbookProcessor) return;

  // Apply snapshot
  orderbookProcessor.applySnapshot(snapshot);

  // Apply buffered updates
  for (const update of bufferedUpdates) {
    orderbookProcessor.applyDelta(update);
  }

  // Post initial slice
  postSlice();
}

// Handle delta update
function handleUpdate(update: BinanceDepthUpdate): void {
  if (!orderbookProcessor) return;
  orderbookProcessor.applyDelta(update);
}

// Post current orderbook slice
function postSlice(): void {
  if (!orderbookProcessor) return;

  const slice = orderbookProcessor.getSlice();
  postTypedMessage({
    type: 'ORDERBOOK_UPDATE',
    data: slice,
    workerTimestamp: performance.now(),
  });
}

// Start the connection
function connect(symbol: string): void {
  // Clean up existing connections
  disconnect();

  // Initialize processor
  orderbookProcessor = new OrderbookProcessor();

  // Initialize sequence manager
  sequenceManager = new SequenceManager(symbol, {
    onStateChange: (state) => {
      postTypedMessage({
        type: 'STATUS_CHANGE',
        status: mapSequenceState(state),
      });
    },
    onSynchronized: handleSynchronized,
    onUpdate: handleUpdate,
    onSequenceGap: () => {
      console.log('[Worker] Sequence gap detected, resyncing...');
    },
  });

  // Initialize WebSocket
  binanceWS = new BinanceWebSocket(symbol, {
    onOpen: () => {
      console.log('[Worker] WebSocket connected');
    },
    onMessage: (data) => {
      sequenceManager?.handleMessage(data);
    },
    onClose: () => {
      console.log('[Worker] WebSocket closed');
    },
    onError: (error) => {
      console.error('[Worker] WebSocket error:', error);
      postTypedMessage({
        type: 'STATUS_CHANGE',
        status: 'error',
        error: 'WebSocket connection failed',
      });
    },
    onReconnecting: (attempt) => {
      console.log(`[Worker] Reconnecting (attempt ${attempt})...`);
      postTypedMessage({
        type: 'STATUS_CHANGE',
        status: 'reconnecting',
      });
      // Reset sequence manager for fresh sync
      sequenceManager?.reset();
    },
  });

  // Start connection
  postTypedMessage({ type: 'STATUS_CHANGE', status: 'connecting' });
  binanceWS.connect();

  // Start periodic slice posting (throttled to 100ms)
  // This ensures we post updates at a consistent rate even if WS messages come faster
  updateInterval = setInterval(() => {
    if (sequenceManager?.state === 'synchronized') {
      postSlice();
    }
  }, 100);
}

// Disconnect and clean up
function disconnect(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  binanceWS?.disconnect();
  binanceWS = null;
  sequenceManager?.reset();
  sequenceManager = null;
  orderbookProcessor = null;
  postTypedMessage({ type: 'STATUS_CHANGE', status: 'disconnected' });
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<MainToWorkerMessage>): void => {
  const { type } = event.data;

  switch (type) {
    case 'CONNECT':
      connect(event.data.symbol);
      break;

    case 'DISCONNECT':
      disconnect();
      break;

    case 'SET_DEPTH':
      orderbookProcessor?.setDepth(event.data.depth);
      break;
  }
};
