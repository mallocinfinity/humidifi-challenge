# Real-Time BTC/USD Orderbook

High-performance orderbook visualization with sub-millisecond rendering, multi-tab synchronization, and three sync mode architectures.

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
Single WebSocket shared across all tabs. Most efficient — one connection, one processor, N consumers.

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

## Technical Decisions & Tradeoffs

### Cumulative totals cascade by design
Each row shows cumulative sum of all better prices. Recalculated on every update. Alternatives considered:
- Lazy cumulative (compute on hover) — Rejected: always-visible is standard for trading UIs
- Virtualization — Unnecessary at 30 rows with 60fps performance

### Sequence gap tolerance
Binance Futures `@depth` stream has frequent small gaps (50-500 sequence numbers). Strict validation would trigger constant resyncs → rate limiting. Solution: tolerate gaps < 1000, only resync on large gaps.

### SAB uses DedicatedWorker, not SharedWorker
SharedWorkers don't inherit `crossOriginIsolated` from the page — they need COEP headers on the worker script response itself. DedicatedWorker inherits from parent, simpler setup.

### Port liveness via PING heartbeat
SharedWorker ports can go stale (tab crash, `port.close()` before DISCONNECT delivered). Solution: main thread pings every 2s, worker prunes ports not seen in 6s.

## Bugs Fixed

1. **TypedArray allocation in RAF loop** — Initial SAB was 5x slower than SharedWorker. Root cause: `new Int32Array()` created 60x/sec for version check. Fix: cached `SABReader`/`SABWriter` classes.

2. **Late-joining tabs stuck on "disconnected"** — Second tab sent CONNECT, but handler did nothing since WebSocket already active. Fix: `sendCurrentState(port)` for late joiners.

3. **Stale ports inflate tab count** — `port.close()` before DISCONNECT delivered. Fix: PING heartbeat + prune interval.

4. **Futures rate limiting (429/418)** — Every sequence gap triggered snapshot fetch. Fix: gap tolerance threshold + max retry limit.

## State Management

**Zustand** was chosen over Redux/Context for:
- **Selector-based subscriptions** — Components only re-render when their specific slice changes, not on every store update
- **No Context wrapper** — Avoids provider hell and React tree coupling
- **Minimal boilerplate** — No actions/reducers/dispatch ceremony
- **Worker-friendly** — Store can be updated from RAF callbacks without hooks

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

## Future Improvements

- Virtualized list for 100+ levels
- WebSocket compression
- E2E tests with Playwright
- Configurable depth levels via UI
- Service Worker for offline caching

## Tech Stack

React 19 · TypeScript 5.9 · Vite 7 · Zustand 5 · Web Workers · SharedArrayBuffer · Atomics