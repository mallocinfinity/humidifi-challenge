// Dedicated Worker - Phase 1
// Posts mock orderbook data every 100ms

import type { MainToWorkerMessage, WorkerToMainMessage, OrderbookSlice, PriceLevel } from '@/types';

declare const self: DedicatedWorkerGlobalScope;

let intervalId: ReturnType<typeof setInterval> | null = null;
let updateId = 1027024;

// Generate mock price levels
function generateMockLevels(basePrice: number, count: number, isBid: boolean): PriceLevel[] {
  const levels: PriceLevel[] = [];
  let cumulative = 0;

  for (let i = 0; i < count; i++) {
    const price = isBid
      ? basePrice - (i * 0.50)
      : basePrice + (i * 0.50);
    const size = Math.round((0.3 + Math.random() * 2.9) * 100) / 100;
    cumulative += size;

    levels.push({
      price,
      size,
      cumulative,
      depthPercent: 0, // Will be calculated after all levels
    });
  }

  return levels;
}

// Calculate depth percentages relative to max cumulative
function calculateDepthPercents(bids: PriceLevel[], asks: PriceLevel[]): void {
  const maxCumulative = Math.max(
    bids[bids.length - 1]?.cumulative ?? 0,
    asks[asks.length - 1]?.cumulative ?? 0
  );

  if (maxCumulative === 0) return;

  for (const level of bids) {
    level.depthPercent = Math.round((level.cumulative / maxCumulative) * 10000) / 100;
  }
  for (const level of asks) {
    level.depthPercent = Math.round((level.cumulative / maxCumulative) * 10000) / 100;
  }
}

// Generate a complete mock orderbook slice
function generateMockSlice(): OrderbookSlice {
  const basePrice = 97500 + (Math.random() - 0.5) * 10; // Small price variation
  const bestBid = Math.floor(basePrice * 100) / 100;
  const bestAsk = bestBid + 0.50;

  const bids = generateMockLevels(bestBid, 15, true);
  const asks = generateMockLevels(bestAsk, 15, false);

  calculateDepthPercents(bids, asks);

  updateId++;

  return {
    bids,
    asks,
    spread: bestAsk - bestBid,
    spreadPercent: (bestAsk - bestBid) / ((bestBid + bestAsk) / 2),
    midpoint: (bestBid + bestAsk) / 2,
    timestamp: Date.now(),
    lastUpdateId: updateId,
  };
}

// Post typed message to main thread
function postTypedMessage(message: WorkerToMainMessage): void {
  self.postMessage(message);
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<MainToWorkerMessage>): void => {
  const { type } = event.data;

  switch (type) {
    case 'CONNECT':
      // Clear any existing interval
      if (intervalId) {
        clearInterval(intervalId);
      }

      // Post initial status
      postTypedMessage({ type: 'STATUS_CHANGE', status: 'connecting' });

      // Simulate brief connection delay
      setTimeout(() => {
        postTypedMessage({ type: 'STATUS_CHANGE', status: 'connected' });

        // Start posting mock data every 100ms
        intervalId = setInterval(() => {
          const slice = generateMockSlice();
          postTypedMessage({
            type: 'ORDERBOOK_UPDATE',
            data: slice,
            workerTimestamp: performance.now(),
          });
        }, 100);
      }, 100);
      break;

    case 'DISCONNECT':
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      postTypedMessage({ type: 'STATUS_CHANGE', status: 'disconnected' });
      break;

    case 'SET_DEPTH':
      // Will be implemented in Phase 2
      break;
  }
};
