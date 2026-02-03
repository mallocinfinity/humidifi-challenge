// BroadcastChannel utilities - Phase 8
import type { WorkerToMainMessage } from '@/types';

export class OrderbookBroadcast {
  private _channel: BroadcastChannel;
  private _isLeader: boolean = false;

  constructor(channelName: string = 'orderbook-sync') {
    this._channel = new BroadcastChannel(channelName);
  }

  setLeader(isLeader: boolean): void {
    this._isLeader = isLeader;
  }

  broadcast(_message: WorkerToMainMessage): void {
    // Will be implemented in Phase 8
  }

  onMessage(_callback: (message: WorkerToMainMessage) => void): void {
    // Will be implemented in Phase 8
  }

  close(): void {
    this._channel.close();
  }

  get isLeader(): boolean {
    return this._isLeader;
  }
}
