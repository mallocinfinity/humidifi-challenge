// SAB Worker - Phase 10
// DedicatedWorker that writes orderbook data directly to SharedArrayBuffer.
// Zero IPC for hot-path data — main thread polls the version counter via Atomics.
// Status changes still go via postMessage (infrequent).
// DedicatedWorker inherits crossOriginIsolated from parent (SharedWorker does NOT).

import type { MainToWorkerMessage, BinanceDepthUpdate, BinanceDepthSnapshot, ConnectionStatus } from '@/types';
import type { Metrics } from '@/types/metrics.ts';
import { BinanceWebSocket } from './binance-ws.ts';
import { SequenceManager, type SequenceState } from './sequence-manager.ts';
import { OrderbookProcessor } from './orderbook-processor.ts';
import { BUFFER_SIZE, SABWriter } from '@/lib/binary-protocol.ts';

// ─── Worker → main message types ─────────────────────────────────────────────
type SABWorkerMessage =
  | { type: 'SAB_READY'; buffer: SharedArrayBuffer }
  | { type: 'STATUS_CHANGE'; status: ConnectionStatus; error?: string }
  | { type: 'METRICS'; data: Partial<Metrics> };

// ─── State ────────────────────────────────────────────────────────────────────
let buffer: SharedArrayBuffer | null = null;
let writer: SABWriter | null = null;
let binanceWS: BinanceWebSocket | null = null;
let sequenceManager: SequenceManager | null = null;
let orderbookProcessor: OrderbookProcessor | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function send(message: SABWorkerMessage): void {
  self.postMessage(message);
}

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

// ─── Orderbook processing ────────────────────────────────────────────────────
function handleSynchronized(snapshot: BinanceDepthSnapshot, bufferedUpdates: BinanceDepthUpdate[]): void {
  if (!orderbookProcessor) return;
  orderbookProcessor.applySnapshot(snapshot);
  for (const update of bufferedUpdates) {
    orderbookProcessor.applyDelta(update);
  }
  writeSlice();
}

function handleUpdate(update: BinanceDepthUpdate): void {
  if (!orderbookProcessor) return;
  orderbookProcessor.applyDelta(update);
}

// ─── Write slice to SAB ──────────────────────────────────────────────────────
function writeSlice(): void {
  if (!orderbookProcessor || !orderbookProcessor.isDirty || !writer) return;
  const slice = orderbookProcessor.getSlice();
  writer.encode(slice);
  // Version is atomically incremented inside writer.encode().
  // Main thread detects the change via Atomics.load in its RAF loop.
}

// ─── WebSocket lifecycle ──────────────────────────────────────────────────────
function connect(symbol: string, wsUrl: string, restUrl: string, streamSuffix: string): void {
  disconnect();

  orderbookProcessor = new OrderbookProcessor();

  sequenceManager = new SequenceManager(symbol, restUrl, {
    onStateChange: (state) => {
      send({ type: 'STATUS_CHANGE', status: mapSequenceState(state) });
    },
    onSynchronized: handleSynchronized,
    onUpdate: handleUpdate,
    onSequenceGap: () => {
      // Rare — handled by SequenceManager resync
    },
  });

  binanceWS = new BinanceWebSocket(symbol, wsUrl, streamSuffix, {
    onOpen: () => { /* connected */ },
    onMessage: (data) => {
      sequenceManager?.handleMessage(data);
    },
    onClose: () => { /* closed */ },
    onError: () => {
      send({ type: 'STATUS_CHANGE', status: 'error', error: 'WebSocket connection failed' });
    },
    onReconnecting: () => {
      send({ type: 'STATUS_CHANGE', status: 'reconnecting' });
      sequenceManager?.reset();
    },
  });

  send({ type: 'STATUS_CHANGE', status: 'connecting' });
  binanceWS.connect();

  // Write to SAB every 100ms — same cadence as other workers.
  updateInterval = setInterval(() => {
    if (sequenceManager?.state === 'synchronized') {
      writeSlice();
    }
  }, 100);
}

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
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent<MainToWorkerMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'CONNECT': {
      // Create SAB — DedicatedWorker inherits crossOriginIsolated from parent
      if (!buffer) {
        buffer = new SharedArrayBuffer(BUFFER_SIZE);
        writer = new SABWriter(buffer);
      }
      // Send buffer reference to main thread
      send({ type: 'SAB_READY', buffer });
      connect(e.data.symbol, e.data.wsUrl, e.data.restUrl, e.data.streamSuffix);
      break;
    }

    case 'DISCONNECT':
      disconnect();
      return;

    case 'SET_DEPTH':
      orderbookProcessor?.setDepth(e.data.depth);
      break;

    case 'VISIBILITY':
      // Dedicated worker doesn't need visibility hints.
      break;
  }
};
