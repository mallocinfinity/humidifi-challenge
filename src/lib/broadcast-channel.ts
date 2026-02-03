// BroadcastChannel utilities - Phase 8
// Leader broadcasts orderbook data to follower tabs.

import type { WorkerToMainMessage } from '@/types';

type BroadcastMessage =
  | { type: 'DATA'; payload: WorkerToMainMessage }
  | { type: 'TAB_COUNT'; count: number };

export class OrderbookBroadcast {
  private _channel: BroadcastChannel;
  private _isLeader: boolean = false;

  constructor(channelName: string = 'orderbook-sync') {
    this._channel = new BroadcastChannel(channelName);
  }

  setLeader(isLeader: boolean): void {
    this._isLeader = isLeader;
  }

  broadcast(message: WorkerToMainMessage): void {
    if (!this._isLeader) return;
    const wrapped: BroadcastMessage = { type: 'DATA', payload: message };
    this._channel.postMessage(wrapped);
  }

  broadcastTabCount(count: number): void {
    if (!this._isLeader) return;
    const wrapped: BroadcastMessage = { type: 'TAB_COUNT', count };
    this._channel.postMessage(wrapped);
  }

  onMessage(callback: (message: WorkerToMainMessage) => void): void {
    this._channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      // Followers process DATA messages; leaders ignore their own broadcasts
      if (this._isLeader) return;

      const msg = event.data;
      if (msg.type === 'DATA') {
        callback(msg.payload);
      }
      // TAB_COUNT messages are handled by the leader internally, not here
    };
  }

  close(): void {
    this._channel.close();
  }

  get isLeader(): boolean {
    return this._isLeader;
  }
}
