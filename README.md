# Humidifi — Real-Time BTC/USD Orderbook

Real-time orderbook visualization for BTC/USD with three synchronization modes, multi-tab support, and sub-millisecond rendering via SharedArrayBuffer.

## Features

- Real-time WebSocket connection to Binance (spot & futures)
- Three sync modes: SharedWorker (default), BroadcastChannel (fallback), SharedArrayBuffer (experimental)
- Multi-tab support with single WebSocket connection
- Leader election for BroadcastChannel mode
- Freeze/resume functionality
- Performance metrics panel (latency, FPS, memory, dropped frames)
- Binary protocol for zero-copy SAB mode
- Sequence management with gap detection and auto-resync

## Tech Stack

React 19, TypeScript 5.9, Vite 7, Zustand 5, Web Workers

## Getting Started

```bash
pnpm install
pnpm dev          # development (localhost:5173)
pnpm build && pnpm preview   # production (localhost:4173)
```

## URL Parameters

| Param | Values | Description |
|-------|--------|-------------|
| `mode` | `shared` (default), `broadcast`, `sab` | Sync mode |
| `exchange` | `spot` (default), `futures` | Data source |

Parameters compose freely:

```
localhost:4173                              # SharedWorker + Binance US Spot
localhost:4173/?mode=sab                    # SharedArrayBuffer mode
localhost:4173/?exchange=futures             # Binance Futures (~50-100 msg/sec)
localhost:4173/?mode=sab&exchange=futures    # SAB + Futures (max throughput)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser Tabs                           │
├─────────────┬─────────────┬─────────────────────────────────────┤
│   Tab 1     │   Tab 2     │   Tab N                             │
│  (Leader)   │ (Follower)  │  (Follower)                         │
│             │             │                                     │
│  React UI   │  React UI   │   React UI                          │
│     ↑       │     ↑       │      ↑                              │
│  Zustand    │  Zustand    │   Zustand                           │
│     ↑       │     ↑       │      ↑                              │
└─────────────┴─────────────┴─────────────────────────────────────┘
         ↑              ↑              ↑
         └──────────────┼──────────────┘
                        │
      ┌─────────────────┴─────────────────┐
      │          SharedWorker             │
      │  ┌─────────────────────────────┐  │
      │  │    Binance WebSocket        │  │
      │  │    Sequence Manager         │  │
      │  │    Orderbook Processor      │  │
      │  └─────────────────────────────┘  │
      └───────────────────────────────────┘
                        │
                        ↓
           wss://stream.binance.us/ws
```

## Sync Modes

**SharedWorker** — Single WebSocket shared across all tabs. Best efficiency. Default when supported.

**BroadcastChannel** — Leader tab owns the Worker/WebSocket, broadcasts updates to follower tabs via BroadcastChannel. Fallback for browsers without SharedWorker (Safari).

**SAB (SharedArrayBuffer)** — DedicatedWorker writes orderbook data to a SharedArrayBuffer using a binary protocol. Main thread polls via `Atomics.load` in a RAF loop — zero IPC for the hot path. Requires cross-origin isolation headers (COOP/COEP). Experimental.

## Performance Optimizations

- RAF-based rendering with dirty checking
- Memoized components with custom comparators
- Object pooling in SAB decode (3 allocations/frame vs 33)
- O(1) metrics counters (no array operations in hot path)
- Worker-side orderbook processing (main thread only renders)
- Broadcast coalescing (one cross-tab message per frame)

## Project Structure

```
src/
├── components/       # React components (OrderBook, Controls, MetricsPanel)
├── hooks/            # useWorker, useSABWorker, useRAFBridge, useOrderbook
├── worker/           # Web Workers (dedicated, shared, SAB)
├── lib/              # Binary protocol, leader election, exchange config
├── store/            # Zustand store
└── types/            # TypeScript types
```
