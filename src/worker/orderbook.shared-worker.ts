// SharedWorker - Phase 9
// Single WebSocket shared across all tabs via MessagePort connections.
// No leader election needed — all tabs are peers.

import type { MainToWorkerMessage, WorkerToMainMessage, BinanceDepthUpdate, BinanceDepthSnapshot } from '@/types';
import { BinanceWebSocket } from './binance-ws.ts';
import { SequenceManager, type SequenceState } from './sequence-manager.ts';
import { OrderbookProcessor } from './orderbook-processor.ts';

declare const self: SharedWorkerGlobalScope;

const ports: MessagePort[] = [];

let binanceWS: BinanceWebSocket | null = null;
let sequenceManager: SequenceManager | null = null;
let orderbookProcessor: OrderbookProcessor | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;

// Broadcast a message to all connected ports
function broadcastToAll(message: WorkerToMainMessage): void {
  for (const port of ports) {
    port.postMessage(message);
  }
}

// Broadcast tab count to all ports
function broadcastTabCount(): void {
  broadcastToAll({ type: 'METRICS', data: { tabCount: ports.length } });
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

  orderbookProcessor.applySnapshot(snapshot);

  for (const update of bufferedUpdates) {
    orderbookProcessor.applyDelta(update);
  }

  postSlice();
}

// Handle delta update
function handleUpdate(update: BinanceDepthUpdate): void {
  if (!orderbookProcessor) return;
  orderbookProcessor.applyDelta(update);
}

// Post current orderbook slice to all tabs
function postSlice(): void {
  if (!orderbookProcessor) return;

  const slice = orderbookProcessor.getSlice();
  broadcastToAll({
    type: 'ORDERBOOK_UPDATE',
    data: slice,
    workerTimestamp: performance.now(),
  });
}

// Start the WebSocket connection (called on first CONNECT)
function connect(symbol: string, wsUrl: string, restUrl: string, streamSuffix: string): void {
  disconnect();

  orderbookProcessor = new OrderbookProcessor();

  sequenceManager = new SequenceManager(symbol, restUrl, {
    onStateChange: (state) => {
      broadcastToAll({
        type: 'STATUS_CHANGE',
        status: mapSequenceState(state),
      });
    },
    onSynchronized: handleSynchronized,
    onUpdate: handleUpdate,
    onSequenceGap: () => {
      console.log('[SharedWorker] Sequence gap detected, resyncing...');
    },
  });

  binanceWS = new BinanceWebSocket(symbol, wsUrl, streamSuffix, {
    onOpen: () => {
      console.log('[SharedWorker] WebSocket connected');
    },
    onMessage: (data) => {
      sequenceManager?.handleMessage(data);
    },
    onClose: () => {
      console.log('[SharedWorker] WebSocket closed');
    },
    onError: (error) => {
      console.error('[SharedWorker] WebSocket error:', error);
      broadcastToAll({
        type: 'STATUS_CHANGE',
        status: 'error',
        error: 'WebSocket connection failed',
      });
    },
    onReconnecting: (attempt) => {
      console.log(`[SharedWorker] Reconnecting (attempt ${attempt})...`);
      broadcastToAll({
        type: 'STATUS_CHANGE',
        status: 'reconnecting',
      });
      sequenceManager?.reset();
    },
  });

  broadcastToAll({ type: 'STATUS_CHANGE', status: 'connecting' });
  binanceWS.connect();

  updateInterval = setInterval(() => {
    if (sequenceManager?.state === 'synchronized') {
      postSlice();
    }
  }, 100);
}

// Disconnect and clean up WebSocket
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
  broadcastToAll({ type: 'STATUS_CHANGE', status: 'disconnected' });
}

// Remove a port and clean up if last tab disconnects
function removePort(port: MessagePort): void {
  const idx = ports.indexOf(port);
  if (idx !== -1) {
    ports.splice(idx, 1);
  }
  broadcastTabCount();

  if (ports.length === 0) {
    disconnect();
  }
}

// Handle new tab connections
self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.push(port);
  console.log(`[SharedWorker] onconnect — now ${ports.length} port(s), wsActive=${!!binanceWS}`);

  port.onmessage = (e: MessageEvent<MainToWorkerMessage>) => {
    const { type } = e.data;

    switch (type) {
      case 'CONNECT':
        // First tab triggers WebSocket start; subsequent tabs piggyback
        if (!binanceWS) {
          connect(e.data.symbol, e.data.wsUrl, e.data.restUrl, e.data.streamSuffix);
        }
        break;

      case 'DISCONNECT':
        removePort(port);
        return;

      case 'SET_DEPTH':
        orderbookProcessor?.setDepth(e.data.depth);
        break;
    }
  };

  port.start();

  // Broadcast updated tab count to all (including the new port)
  broadcastTabCount();
};
