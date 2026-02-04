// Binance WebSocket connection - Phase 2
import type { BinanceDepthUpdate } from '@/types';
import { isBinanceDepthUpdate } from '@/types';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export interface BinanceWSCallbacks {
  onMessage: (data: BinanceDepthUpdate) => void;
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Event) => void;
  onReconnecting: (attempt: number) => void;
}

export class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: BinanceWSCallbacks;
  private symbol: string;
  private wsUrl: string;
  private streamSuffix: string;
  private retryCount = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(symbol: string, wsUrl: string, streamSuffix: string, callbacks: BinanceWSCallbacks) {
    this.symbol = symbol.toLowerCase();
    this.wsUrl = wsUrl;
    this.streamSuffix = streamSuffix;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.shouldReconnect = true;
    const streamUrl = `${this.wsUrl}/${this.symbol}${this.streamSuffix}`;
    console.log('[BinanceWS] Connecting:', streamUrl);

    try {
      this.ws = new WebSocket(streamUrl);

      this.ws.onopen = () => {
        this.retryCount = 0;
        this.callbacks.onOpen();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data: unknown = JSON.parse(event.data as string);
          if (isBinanceDepthUpdate(data)) {
            this.callbacks.onMessage(data);
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.callbacks.onClose();
        this.handleReconnect();
      };

      this.ws.onerror = (error: Event) => {
        this.callbacks.onError(error);
      };
    } catch {
      this.handleReconnect();
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    this.retryCount = 0;
  }

  private handleReconnect(): void {
    if (!this.shouldReconnect || this.retryCount >= MAX_RETRIES) {
      return;
    }

    this.retryCount++;
    this.callbacks.onReconnecting(this.retryCount);

    // Exponential backoff with jitter
    const delay = Math.min(
      BASE_DELAY_MS * Math.pow(2, this.retryCount - 1) + Math.random() * 1000,
      30000
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
