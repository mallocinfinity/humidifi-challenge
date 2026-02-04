# Real-Time BTC/USD Orderbook

High-performance orderbook visualization with sub-millisecond rendering, multi-tab synchronization, and three sync mode architectures.

![GID](https://github.com/user-attachments/assets/9c3e01f9-c7a5-4533-abba-6bccd8c76478)

## Features

- **Real-time WebSocket** — Binance US Spot & Futures with sequence-gapped resync
- **Three sync modes** — SharedWorker (default), BroadcastChannel (fallback), SharedArrayBuffer (experimental zero-copy)
- **Multi-tab support** — Single WebSocket shared across tabs, leader election for Broadcast mode
- **Freeze/Resume** — Pause updates without losing data continuity
- **Performance metrics** — Latency (cur/min/avg/max/p95), FPS, dropped frames, memory, tab count

## Quick Start
```bash
pnpm install
pnpm dev              # localhost:5173
pnpm build && pnpm preview   # localhost:4173 (production)
```

## URL Parameters

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `mode` | `shared`, `broadcast`, `sab` | `shared` | Sync architecture |
| `exchange` | `spot`, `futures` | `spot` | Data source |

**Examples:**
```
localhost:4173                          # SharedWorker + Spot
localhost:4173/?mode=sab                # SharedArrayBuffer mode
localhost:4173/?exchange=futures        # Binance Futures (higher volume)
localhost:4173/?mode=sab&exchange=futures
```

## Architecture
```
┌──────────────────────────────────────────────────────────┐
│                      Browser Tabs                        │
├─────────────┬─────────────┬──────────────────────────────┤
│   Tab 1     │   Tab 2     │   Tab N                      │
│  (Leader)   │ (Follower)  │  (Follower)                  │
│             │             │                              │
│  React UI ←─┼─── Zustand ─┼──→ React UI                  │
└─────────────┴──────┬──────┴──────────────────────────────┘
                     │
       ┌─────────────┴─────────────┐
       │       SharedWorker        │
       │  ┌─────────────────────┐  │
       │  │  BinanceWebSocket   │  │
       │  │  SequenceManager    │  │
       │  │  OrderbookProcessor │  │
       │  └─────────────────────┘  │
       └─────────────┬─────────────┘
                     │
                     ↓
        wss://stream.binance.us/ws
```

## Sync Modes Explained

### SharedWorker (default)
Single WebSocket shared across all tabs. Most efficient, one connection, one processor, N consumers.

### BroadcastChannel
Leader tab owns the Worker + WebSocket, broadcasts updates to followers via BroadcastChannel. Fallback for Safari (no SharedWorker support). Leader election handles tab close gracefully.

### SharedArrayBuffer (experimental)
DedicatedWorker writes orderbook to a SharedArrayBuffer using a custom binary protocol. Main thread polls via `Atomics.load()` in RAF loop — **zero IPC for the hot path**. Requires COOP/COEP headers (configured in Vite).

**Performance comparison (60s test, production build):**
| Mode | Frame Drops | Latency (avg) |
|------|-------------|---------------|
| SAB | 0 | 0.02ms |
| SharedWorker | 0-3 | 7-8ms |
| Broadcast (leader) | 0-3 | 6-8ms |
| Broadcast (follower) | 0-3 | 15-17ms |

## Performance Optimizations

- **RAF-based rendering** — Dirty checking, only render on actual data change
- **Memoized components** — Custom comparators for OrderBookRow (price+size, not object reference)
- **Object pooling (SAB)** — Reuse PriceLevel objects, 3 allocations/frame vs 34
- **O(1) metrics** — No RollingAverage array ops in hot path, simple counters
- **Worker-side processing** — Main thread only renders, never parses/sorts
- **Direct broadcast** — Leader broadcasts every worker message immediately (no RAF coalescing — RAF is paused for background tabs)

## Bugs Fixed

1. **TypedArray allocation in RAF loop** — Initial SAB was 5x slower than SharedWorker. Root cause: `new Int32Array()` created 60x/sec for version check. Fix: cached `SABReader`/`SABWriter` classes.

2. **Late-joining tabs stuck on "disconnected"** — Second tab sent CONNECT, but handler did nothing since WebSocket already active. Fix: `sendCurrentState(port)` for late joiners.

3. **Stale ports inflate tab count** — `port.close()` before DISCONNECT delivered. Fix: PING heartbeat + prune interval.

4. **Futures rate limiting (429/418)** — Every sequence gap triggered snapshot fetch. Fix: gap tolerance threshold + max retry limit.

## Project Structure
```
src/
├── components/       # React (OrderBook, Controls, MetricsPanel)
├── hooks/            # useWorker, useSABWorker, useRAFBridge
├── worker/           # Web Workers (dedicated, shared, SAB variants)
├── lib/              # binary-protocol, leader-election, exchange-config
├── store/            # Zustand store
└── types/            # TypeScript types + Binance API type guards
```
## State Management

**Zustand** was chosen over Redux/Context for:
- **Selector-based subscriptions** — Components only re-render when their specific slice changes, not on every store update
- **No Context wrapper** — Avoids provider hell and React tree coupling  
- **Minimal boilerplate** — No actions/reducers/dispatch ceremony
- **Worker-friendly** — Store can be updated from RAF callbacks without hooks

## Performance Metrics

The MetricsPanel displays:
- **Messages/sec** — Render update rate (slices delivered to UI). The worker processes all WebSocket messages (potentially 50-100+/sec) and emits coalesced updates at 10Hz to prevent render thrashing.
- **Latency** — End-to-end processing time from data decode to store update (cur/min/avg/max/p95)
- **FPS** — Actual frame rate, target 60
- **Dropped frames** — Frames exceeding 16.67ms budget
- **JS Heap** — Memory usage via `performance.memory`

## Tradeoffs & Decisions

| Decision | Rationale |
|----------|-----------|
| Worker-side processing | Main thread only renders; parsing, sorting, and delta application happen in worker |
| RAF-based rendering | Dirty checking prevents render thrashing; only render when data actually changes |
| 10Hz UI updates | Worker coalesces WebSocket messages (up to 100/sec) into 10 slices/sec — imperceptible to humans, massive perf win |
| Cumulative totals recalculated | Simpler than incremental updates; 30 rows × 10/sec = trivial compute |
| SharedWorker as default | Single WebSocket across tabs; BroadcastChannel as fallback for Safari |
| SAB experimental | Proves zero-copy capability; structured clone is actually fast enough at this data rate |

## Future Improvements

- Virtualized list for 100+ price levels
- WebSocket compression (permessage-deflate)
- Service Worker for offline caching of last known state
- E2E tests with Playwright
- Configurable depth levels via UI
- Better tab tracking

## Tech Stack

React 19 · TypeScript 5.9 · Vite 7 · Zustand 5 · Web Workers · SharedArrayBuffer · Atomics
