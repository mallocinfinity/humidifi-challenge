import { memo } from 'react';
import type { OrderBookRowProps } from '@/types';

function OrderBookRowComponent(_props: OrderBookRowProps) {
  return <div className="orderbook-row">Row placeholder</div>;
}

export const OrderBookRow = memo(OrderBookRowComponent);
