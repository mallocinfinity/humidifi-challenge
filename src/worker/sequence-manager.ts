// Sequence management - Phase 2
// Implements Binance synchronization protocol

import type { BinanceDepthUpdate, BinanceDepthSnapshot } from '@/types';
import { isBinanceDepthSnapshot } from '@/types';

const FETCH_TIMEOUT_MS = 10000;
const MAX_SNAPSHOT_RETRIES = 3;

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
  private restUrl: string;
  private isFetching = false;
  private fetchRetryCount = 0;
  private abortController: AbortController | null = null;

  constructor(symbol: string, restUrl: string, callbacks: SequenceManagerCallbacks) {
    this.symbol = symbol.toUpperCase();
    this.restUrl = restUrl;
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
    this.fetchRetryCount = 0;
    this.setState('syncing');

    await this.doFetch();
  }

  private async doFetch(): Promise<void> {
    // Abort any previous in-flight request
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Timeout: abort fetch after FETCH_TIMEOUT_MS
    const timeout = setTimeout(() => this.abortController?.abort(), FETCH_TIMEOUT_MS);

    try {
      const url = `${this.restUrl}?symbol=${this.symbol}&limit=1000`;
      const response = await fetch(url, { signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: unknown = await response.json();

      if (!isBinanceDepthSnapshot(data)) {
        throw new Error('Invalid snapshot response');
      }

      this.processSnapshot(data);
    } catch (error) {
      clearTimeout(timeout);
      // Don't retry if aborted (reset() was called)
      if (signal.aborted) return;

      this.fetchRetryCount++;
      console.error(`[SequenceManager] Snapshot fetch failed (attempt ${this.fetchRetryCount}/${MAX_SNAPSHOT_RETRIES}):`, error);

      if (this.fetchRetryCount < MAX_SNAPSHOT_RETRIES) {
        setTimeout(() => {
          if (!signal.aborted) this.doFetch();
        }, 2000);
      } else {
        console.error('[SequenceManager] Max snapshot retries reached');
        this.isFetching = false;
      }
    }
  }

  private processSnapshot(snapshot: BinanceDepthSnapshot): void {
    // Step 4: If snapshot.lastUpdateId < first buffered event's U, refetch
    const firstBuffered = this.buffer[0];
    if (firstBuffered && snapshot.lastUpdateId < firstBuffered.U) {
      if (this.fetchRetryCount < MAX_SNAPSHOT_RETRIES) {
        this.fetchRetryCount++;
        setTimeout(() => this.doFetch(), 500);
        return;
      }
    }

    // Step 5: Discard buffered events where u <= snapshot.lastUpdateId
    const validUpdates = this.buffer.filter(
      (update) => update.u > snapshot.lastUpdateId
    );

    // Step 6: First valid event should have U <= lastUpdateId <= u
    // (gap between snapshot and first buffered event is acceptable)

    this.lastUpdateId = snapshot.lastUpdateId;
    this.buffer = [];
    this.isFetching = false;
    this.setState('synchronized');

    // Notify with snapshot and valid buffered updates
    this.callbacks.onSynchronized(snapshot, validUpdates);
  }

  // Futures @depth streams frequently skip 100-500 sequence numbers — normal
  // for aggregated feeds. Only resync on large gaps (corrupted/stale data).
  private static readonly GAP_TOLERANCE = 1000;

  private validateSequence(update: BinanceDepthUpdate): boolean {
    if (this.lastUpdateId === 0) {
      return true;
    }

    const expectedU = this.lastUpdateId + 1;

    // Overlapping or contiguous — always fine
    if (update.U <= expectedU) {
      return true;
    }

    // Small gap — tolerate it, the orderbook is still usable
    const gap = update.U - expectedU;
    if (gap <= SequenceManager.GAP_TOLERANCE) {
      return true;
    }

    // Large gap — resync
    console.log(`[SequenceManager] Large gap detected (${gap}): expected U <= ${expectedU}, got ${update.U}`);
    return false;
  }

  reset(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.buffer = [];
    this.currentState = 'buffering';
    this.lastUpdateId = 0;
    this.isFetching = false;
    this.fetchRetryCount = 0;
  }
}
