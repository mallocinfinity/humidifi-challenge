// Exchange configuration - Spot vs Futures toggle via ?exchange= URL param

export type Exchange = 'spot' | 'futures';

export interface ExchangeConfig {
  wsUrl: string;
  restUrl: string;
  symbol: string;
  streamSuffix: string;
}

export const EXCHANGES: Record<Exchange, ExchangeConfig> = {
  spot: {
    wsUrl: 'wss://stream.binance.us:9443/ws',
    restUrl: 'https://api.binance.us/api/v3/depth',
    symbol: 'BTCUSD',
    streamSuffix: '@depth@100ms',
  },
  futures: {
    wsUrl: 'wss://fstream.binance.com/ws',
    restUrl: 'https://fapi.binance.com/fapi/v1/depth',
    symbol: 'BTCUSDT',
    streamSuffix: '@depth',
  },
};

export function detectExchange(): Exchange {
  const params = new URLSearchParams(window.location.search);
  return params.get('exchange') === 'futures' ? 'futures' : 'spot';
}
