// BroadcastChannel utilities - Phase 8
// Leader broadcasts orderbook data to follower tabs.
// Followers send pings so the leader can track tab count.

import type { WorkerToMainMessage } from '@/types';

/** Leader → follower messages */
type LeaderMessage =
  | { type: 'DATA'; payload: WorkerToMainMessage }
  | { type: 'TAB_COUNT'; count: number };

/** Follower → leader messages */
type FollowerMessage =
  | { type: 'TAB_PING'; tabId: string };

type BroadcastMessage = LeaderMessage | FollowerMessage;

export interface TabCountCallback {
  (count: number): void;
}

export interface PingCallback {
  (tabId: string): void;
}

export class OrderbookBroadcast {
  private _channel: BroadcastChannel;
  private _isLeader: boolean = false;
  private _dataCallback: ((message: WorkerToMainMessage) => void) | null = null;
  private _tabCountCallback: TabCountCallback | null = null;
  private _pingCallback: PingCallback | null = null;

  constructor(channelName: string = 'orderbook-sync') {
    this._channel = new BroadcastChannel(channelName);
    this._channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      this.handleMessage(event.data);
    };
  }

  setLeader(isLeader: boolean): void {
    this._isLeader = isLeader;
  }

  broadcast(message: WorkerToMainMessage): void {
    if (!this._isLeader) return;
    const wrapped: LeaderMessage = { type: 'DATA', payload: message };
    this._channel.postMessage(wrapped);
  }

  broadcastTabCount(count: number): void {
    if (!this._isLeader) return;
    const wrapped: LeaderMessage = { type: 'TAB_COUNT', count };
    this._channel.postMessage(wrapped);
  }

  sendPing(tabId: string): void {
    const msg: FollowerMessage = { type: 'TAB_PING', tabId };
    this._channel.postMessage(msg);
  }

  onMessage(callback: (message: WorkerToMainMessage) => void): void {
    this._dataCallback = callback;
  }

  onTabCount(callback: TabCountCallback): void {
    this._tabCountCallback = callback;
  }

  onPing(callback: PingCallback): void {
    this._pingCallback = callback;
  }

  close(): void {
    this._channel.close();
  }

  get isLeader(): boolean {
    return this._isLeader;
  }

  private handleMessage(msg: BroadcastMessage): void {
    switch (msg.type) {
      case 'DATA':
        // Only followers process data
        if (!this._isLeader) {
          this._dataCallback?.(msg.payload);
        }
        break;
      case 'TAB_COUNT':
        // Only followers process tab count
        if (!this._isLeader) {
          this._tabCountCallback?.(msg.count);
        }
        break;
      case 'TAB_PING':
        // Only leader processes pings
        if (this._isLeader) {
          this._pingCallback?.(msg.tabId);
        }
        break;
    }
  }
}
