// Binance WebSocket connection - Phase 2
import type { BinanceDepthUpdate } from '@/types';

export interface BinanceWSCallbacks {
  onMessage: (data: BinanceDepthUpdate) => void;
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Event) => void;
}

export class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: BinanceWSCallbacks;
  private symbol: string;

  constructor(symbol: string, callbacks: BinanceWSCallbacks) {
    this.symbol = symbol;
    this.callbacks = callbacks;
  }

  connect(): void {
    // Will be implemented in Phase 2
    void this.symbol;
    void this.callbacks;
  }

  disconnect(): void {
    // Will be implemented in Phase 2
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
