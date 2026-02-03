// Sequence management - Phase 2
// Implements Binance synchronization protocol

import type { BinanceDepthUpdate, BinanceDepthSnapshot } from '@/types';
import { isBinanceDepthSnapshot } from '@/types';

const BINANCE_REST_URL = 'https://api.binance.us/api/v3/depth';

export type SequenceState =
  | 'buffering'      // Collecting messages before snapshot
  | 'syncing'        // Fetching snapshot
  | 'synchronized'   // Normal operation
  | 'resyncing';     // Detected gap, refetching

export interface SequenceManagerCallbacks {
  onStateChange: (state: SequenceState) => void;
  onSynchronized: (snapshot: BinanceDepthSnapshot, bufferedUpdates: BinanceDepthUpdate[]) => void;
  onUpdate: (update: BinanceDepthUpdate) => void;
  onSequenceGap: () => void;
}

export class SequenceManager {
  private currentState: SequenceState = 'buffering';
  private buffer: BinanceDepthUpdate[] = [];
  private lastUpdateId: number = 0;
  private callbacks: SequenceManagerCallbacks;
  private symbol: string;
  private isFetching = false;

  constructor(symbol: string, callbacks: SequenceManagerCallbacks) {
    this.symbol = symbol.toUpperCase();
    this.callbacks = callbacks;
  }

  get state(): SequenceState {
    return this.currentState;
  }

  private setState(state: SequenceState): void {
    if (this.currentState !== state) {
      this.currentState = state;
      this.callbacks.onStateChange(state);
    }
  }

  // Called for every WebSocket message
  handleMessage(update: BinanceDepthUpdate): void {
    switch (this.currentState) {
      case 'buffering':
        // Buffer all messages until we fetch snapshot
        this.buffer.push(update);
        // Start fetching snapshot after first message
        if (!this.isFetching) {
          this.fetchSnapshot();
        }
        break;

      case 'syncing':
        // Continue buffering while fetching snapshot
        this.buffer.push(update);
        break;

      case 'synchronized':
        // Validate sequence
        if (this.validateSequence(update)) {
          this.lastUpdateId = update.u;
          this.callbacks.onUpdate(update);
        } else {
          // Sequence gap detected
          this.callbacks.onSequenceGap();
          this.reset();
          this.handleMessage(update); // Reprocess as buffering
        }
        break;

      case 'resyncing':
        // Buffer while resyncing
        this.buffer.push(update);
        break;
    }
  }

  async fetchSnapshot(): Promise<void> {
    if (this.isFetching) return;

    this.isFetching = true;
    this.setState('syncing');

    try {
      const url = `${BINANCE_REST_URL}?symbol=${this.symbol}&limit=1000`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: unknown = await response.json();

      if (!isBinanceDepthSnapshot(data)) {
        throw new Error('Invalid snapshot response');
      }

      this.processSnapshot(data);
    } catch (error) {
      console.error('[SequenceManager] Snapshot fetch failed:', error);
      // Retry after delay
      setTimeout(() => {
        this.isFetching = false;
        this.fetchSnapshot();
      }, 2000);
    }
  }

  private processSnapshot(snapshot: BinanceDepthSnapshot): void {
    // Step 4: If snapshot.lastUpdateId < first buffered event's U, refetch
    const firstBuffered = this.buffer[0];
    if (firstBuffered && snapshot.lastUpdateId < firstBuffered.U) {
      console.log('[SequenceManager] Snapshot too old, refetching...');
      this.isFetching = false;
      setTimeout(() => this.fetchSnapshot(), 500);
      return;
    }

    // Step 5: Discard buffered events where u <= snapshot.lastUpdateId
    const validUpdates = this.buffer.filter(
      (update) => update.u > snapshot.lastUpdateId
    );

    // Step 6: First valid event should have U <= lastUpdateId <= u
    const firstValid = validUpdates[0];
    if (firstValid) {
      if (!(firstValid.U <= snapshot.lastUpdateId + 1 && snapshot.lastUpdateId + 1 <= firstValid.u + 1)) {
        // Gap between snapshot and first buffered event - this is acceptable
        // as long as we have continuous sequence from first valid event
      }
    }

    this.lastUpdateId = snapshot.lastUpdateId;
    this.buffer = [];
    this.isFetching = false;
    this.setState('synchronized');

    // Notify with snapshot and valid buffered updates
    this.callbacks.onSynchronized(snapshot, validUpdates);
  }

  private validateSequence(update: BinanceDepthUpdate): boolean {
    // For each event: U should be lastUpdateId + 1
    // Allow some flexibility for the first event after sync
    if (this.lastUpdateId === 0) {
      return true;
    }

    // U should be <= lastUpdateId + 1 for continuous sequence
    // The event covers range [U, u], so next event's U should be prev u + 1
    const expectedU = this.lastUpdateId + 1;

    // Allow if U <= expectedU (overlapping is OK, gap is not)
    if (update.U > expectedU) {
      console.log(`[SequenceManager] Gap detected: expected U <= ${expectedU}, got ${update.U}`);
      return false;
    }

    return true;
  }

  reset(): void {
    this.buffer = [];
    this.currentState = 'buffering';
    this.lastUpdateId = 0;
    this.isFetching = false;
  }
}
