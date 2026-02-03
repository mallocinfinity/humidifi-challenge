// Sequence management - Phase 2
import type { BinanceDepthUpdate, BinanceDepthSnapshot } from '@/types';

export type SequenceState =
  | 'buffering'      // Collecting messages before snapshot
  | 'syncing'        // Fetching snapshot
  | 'synchronized'   // Normal operation
  | 'resyncing';     // Detected gap, refetching

export interface SequenceManagerCallbacks {
  onStateChange: (state: SequenceState) => void;
  onSynchronized: (snapshot: BinanceDepthSnapshot, bufferedUpdates: BinanceDepthUpdate[]) => void;
  onSequenceGap: () => void;
}

export class SequenceManager {
  private currentState: SequenceState = 'buffering';
  private buffer: BinanceDepthUpdate[] = [];
  private lastId: number = 0;
  private callbacks: SequenceManagerCallbacks;
  private symbol: string;

  constructor(symbol: string, callbacks: SequenceManagerCallbacks) {
    this.symbol = symbol;
    this.callbacks = callbacks;
  }

  get state(): SequenceState {
    return this.currentState;
  }

  bufferMessage(_update: BinanceDepthUpdate): void {
    // Will be implemented in Phase 2
    void this.buffer;
  }

  async fetchSnapshot(): Promise<void> {
    // Will be implemented in Phase 2
    void this.symbol;
    void this.callbacks;
  }

  validateSequence(_update: BinanceDepthUpdate): boolean {
    // Will be implemented in Phase 2
    void this.lastId;
    return true;
  }

  updateLastId(id: number): void {
    this.lastId = id;
  }

  reset(): void {
    this.buffer = [];
    this.currentState = 'buffering';
    this.lastId = 0;
  }
}
