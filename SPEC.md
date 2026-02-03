# Humidifi Orderbook — Architecture Specification

## Overview

Real-time orderbook visualization for BTC/USD using Binance WebSocket. Optimized for 60fps rendering under high-frequency updates (10-100+ messages/second).

**Challenge Requirements:**
- Display top 15 bid levels and top 15 ask levels
- Show price, quantity, and cumulative depth for each level
- Visual depth bars showing relative size
- Spread indicator (difference between best bid and best ask)
- No dropped frames at 60fps under normal update frequency
- React DevTools Profiler should show minimal unnecessary re-renders
- Updates should batch efficiently - not re-render on every WebSocket message

**Bonus Features (Required for this implementation):**
- Freeze/unfreeze: Pause display while data streams in background
- Multi-tab sync: Share WebSocket connection across tabs
- Performance metrics: Display actual update rate, render time, memory usage

---

## Decision Log

| # | Decision | Choice | Justification |
|---|----------|--------|---------------|
| 1 | State management | Zustand | Lightweight, selector-based subscriptions, no boilerplate |
| 2 | WebSocket location | Worker thread | Keeps JSON parsing off main thread |
| 3 | Update batching | Ref + dirty flag + RAF | Decouples message rate from render rate, syncs to display refresh |
| 4 | Row memoization | React.memo + custom comparator | Only re-render rows where price/size actually changed |
| 5 | Styling approach | CSS classes + CSS custom properties | No inline styles (breaks memo), use `--depth-width` variable |
| 6 | Sequence handling | Full Binance-spec implementation | Buffer → snapshot → discard stale → apply deltas |
| 7 | Metrics display | Console always + UI panel | Proves performance to reviewers |
| 8 | Flash animations | Imperative classList + opacity | GPU composite, no React state for animations |
| 9 | Multi-tab sync | Both SharedWorker and BroadcastChannel | Feature flag to toggle, metrics compare both approaches |
| 10 | Freeze/unfreeze | Separate Zustand slices | `liveOrderbook` always updates, `frozenOrderbook` is snapshot, UI switches |
| 11 | TypeScript | Strict mode | Shows code quality |
| 12 | File structure | Modular by concern | Worker, store, hooks, components isolated |
| 13 | Error handling | Status indicator + dim overlay | Not toasts (too noisy for frequent reconnects) |
| 14 | Snapshot fetching | Worker fetches REST, shows "syncing" indicator | Don't block UI |
| 15 | Initial load | Parallel WS + REST, buffer deltas, apply after snapshot | ~150-300ms to first pixel |
| 16 | Depth bars | Relative to max size in view | `width = (size / maxSize) * 100%` |
| 17 | Cumulative calculation | Worker computes | Main thread does zero math |
| 18 | Depth bar rendering | CSS custom property + translateZ(0) | GPU composited, no layout thrash |
| 19 | Row keys | Index-based | Better perf for rapidly changing data than price-based keys |
| 20 | Spread indicator | Computed in Worker | `bestAsk - bestBid`, sent with each slice |
| 21 | WebSocket reconnection | Exponential backoff with jitter | Max 5 retries, then surface error to UI |
| 22 | Visibility handling | Pause RAF on hidden, continue WS | No stale data flash on tab return |

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORKER THREAD                                  │
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────┐   │
│  │  WebSocket  │───▶│  OrderBook Map   │───▶│  Slice Top 15 + Compute │   │
│  │  Binance    │    │  bids: Map<p,s>  │    │  - Sort                 │   │
│  │             │    │  asks: Map<p,s>  │    │  - Cumulative           │   │
│  └─────────────┘    └──────────────────┘    │  - Spread               │   │
│        │                    │               │  - Max size             │   │
│        │                    │               └───────────┬─────────────┘   │
│        │ reconnect          │ sequence                  │                  │
│        │ logic              │ tracking                  │ postMessage      │
│        │                    │                           │ (with timestamp) │
│  ┌─────┴─────┐    ┌────────┴────────┐                  │                  │
│  │  Backoff  │    │  REST Snapshot  │                  │                  │
│  │  + Jitter │    │  (initial sync) │                  │                  │
│  └───────────┘    └─────────────────┘                  │                  │
│                                                         │                  │
└─────────────────────────────────────────────────────────┼──────────────────┘
                                                          │
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAIN THREAD                                    │
│                                                                             │
│  ┌─────────────────┐    ┌──────────────┐    ┌─────────────────────────┐   │
│  │  onmessage      │───▶│ latestData   │───▶│  RAF Loop               │   │
│  │  from Worker    │    │ (ref)        │    │  if (dirty) {           │   │
│  │                 │    │ dirty flag   │    │    push to Zustand      │   │
│  └─────────────────┘    └──────────────┘    │    dirty = false        │   │
│                                             │  }                       │   │
│                                             └───────────┬─────────────┘   │
│                                                         │                  │
│                                                         ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                         ZUSTAND STORE                                │ │
│  │  {                                                                   │ │
│  │    liveOrderbook: OrderbookSlice,                                   │ │
│  │    frozenOrderbook: OrderbookSlice | null,                          │ │
│  │    isFrozen: boolean,                                               │ │
│  │    connectionStatus: 'connecting' | 'connected' | 'reconnecting',   │ │
│  │    metrics: MetricsState,                                           │ │
│  │  }                                                                   │ │
│  └──────────────────────────────────────────────────────┬───────────────┘ │
│                                                         │                  │
│                                                         ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                         REACT COMPONENTS                             │ │
│  │                                                                      │ │
│  │  ┌─────────────┐  ┌───────────────────────────┐  ┌────────────────┐ │ │
│  │  │   Spread    │  │       OrderBook           │  │ MetricsPanel   │ │ │
│  │  │  (memo'd)   │  │  ┌─────────────────────┐  │  │                │ │ │
│  │  └─────────────┘  │  │ OrderBookRow (memo) │  │  └────────────────┘ │ │
│  │                   │  │ OrderBookRow (memo) │  │                     │ │
│  │  ┌─────────────┐  │  │ OrderBookRow (memo) │  │  ┌────────────────┐ │ │
│  │  │  Controls   │  │  │ ... x 30 rows       │  │  │ StatusIndicator│ │ │
│  │  │  (freeze)   │  │  └─────────────────────┘  │  │                │ │ │
│  │  └─────────────┘  └───────────────────────────┘  └────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Tab Architecture

### Option A: SharedWorker (Feature Flag: `multiTabMode=sharedworker`)

```
Tab 1 ──┐
Tab 2 ──┼──▶ SharedWorker ──▶ 1 WebSocket ──▶ Binance
Tab 3 ──┘         │
                  └──▶ postMessage to all connected ports
```

- Single WebSocket connection regardless of tab count
- Worker persists as long as any tab is open
- No leader election needed
- **Limitation:** No Safari support

### Option B: BroadcastChannel (Feature Flag: `multiTabMode=broadcast`)

```
Tab 1 (leader) ──▶ Worker ──▶ WebSocket ──▶ Binance
      │
      └──▶ BroadcastChannel ──▶ Tab 2, Tab 3 (followers)
```

- Leader tab owns the WebSocket
- Leader broadcasts to other tabs via BroadcastChannel
- Leader election on tab close (lowest timestamp becomes leader)
- **Limitation:** +1 hop latency for followers, election delay on leader close

---

## TypeScript Interfaces

```typescript
// ============================================================================
// BINANCE API TYPES
// ============================================================================

/** Binance WebSocket depth update message */
interface BinanceDepthUpdate {
  e: 'depthUpdate';           // Event type
  E: number;                  // Event time (ms)
  s: string;                  // Symbol (e.g., "BTCUSD")
  U: number;                  // First update ID in event
  u: number;                  // Final update ID in event
  b: [string, string][];      // Bids [price, quantity][]
  a: [string, string][];      // Asks [price, quantity][]
}

/** Binance REST depth snapshot response */
interface BinanceDepthSnapshot {
  lastUpdateId: number;
  bids: [string, string][];   // [price, quantity][]
  asks: [string, string][];   // [price, quantity][]
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/** Single price level in the orderbook */
interface PriceLevel {
  price: number;
  size: number;
  cumulative: number;         // Running total from best price
  depthPercent: number;       // 0-100, relative to max cumulative
}

/** Processed orderbook slice ready for UI */
interface OrderbookSlice {
  bids: PriceLevel[];         // Top 15, sorted best (highest) to worst
  asks: PriceLevel[];         // Top 15, sorted best (lowest) to worst
  spread: number;             // Best ask - best bid
  spreadPercent: number;      // (spread / midpoint) * 100
  midpoint: number;           // (bestBid + bestAsk) / 2
  timestamp: number;          // When this slice was created
  lastUpdateId: number;       // Binance sequence ID
}

/** Connection status */
type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'syncing'                 // Fetching initial snapshot
  | 'connected'
  | 'reconnecting'
  | 'error';

/** Performance metrics */
interface Metrics {
  // Throughput
  messagesPerSecond: number;
  
  // Latency (WebSocket message → DOM update)
  latencyMs: {
    current: number;
    avg: number;
    min: number;
    max: number;
    p95: number;
  };
  
  // Rendering
  fps: number;
  droppedFrames: number;
  rowsRerenderedLastUpdate: number;
  
  // Memory
  heapUsedMB: number;
  heapGrowthMB: number;       // Since start
  
  // Connection
  reconnectCount: number;
  sequenceGaps: number;
  tabCount: number;           // For multi-tab mode
}

// ============================================================================
// WORKER MESSAGE TYPES
// ============================================================================

/** Messages from Main Thread → Worker */
type MainToWorkerMessage =
  | { type: 'CONNECT'; symbol: string }
  | { type: 'DISCONNECT' }
  | { type: 'SET_DEPTH'; depth: number };  // Change from 15 to N levels

/** Messages from Worker → Main Thread */
type WorkerToMainMessage =
  | { type: 'ORDERBOOK_UPDATE'; data: OrderbookSlice; workerTimestamp: number }
  | { type: 'STATUS_CHANGE'; status: ConnectionStatus; error?: string }
  | { type: 'METRICS'; data: Partial<Metrics> };

// ============================================================================
// ZUSTAND STORE TYPES
// ============================================================================

interface OrderbookStore {
  // State
  liveOrderbook: OrderbookSlice | null;
  frozenOrderbook: OrderbookSlice | null;
  isFrozen: boolean;
  connectionStatus: ConnectionStatus;
  error: string | null;
  metrics: Metrics;
  
  // Actions
  updateLiveOrderbook: (slice: OrderbookSlice) => void;
  freeze: () => void;
  unfreeze: () => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  updateMetrics: (partial: Partial<Metrics>) => void;
  
  // Selectors (for use with shallow equality)
  // Components should use these, not raw state access
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface OrderBookRowProps {
  level: PriceLevel;
  side: 'bid' | 'ask';
  maxCumulative: number;      // For depth bar calculation
  isFlashing: boolean;        // Trigger flash animation
}

interface OrderBookProps {
  // No props - reads from store via hooks
}

interface MetricsPanelProps {
  // No props - reads from store via hooks
}

interface ControlsProps {
  // No props - reads from store via hooks
}
```

---

## Binance WebSocket Synchronization

Per official Binance documentation, the correct sequence:

```
1. Open WebSocket to wss://stream.binance.us:9443/ws/btcusd@depth@100ms
2. Buffer ALL events received (do not process yet)
3. Fetch REST snapshot from https://api.binance.us/api/v3/depth?symbol=BTCUSD&limit=1000
4. If snapshot.lastUpdateId < first buffered event's U, refetch snapshot
5. Discard any buffered events where u <= snapshot.lastUpdateId
6. First valid event should have U <= lastUpdateId <= u
7. Apply remaining buffered events to snapshot
8. Continue processing live events
9. For each event: if U !== lastUpdateId + 1, sequence gap detected → resync
```

**Key rules:**
- `U` = First update ID in event
- `u` = Final update ID in event
- Quantity `"0"` means REMOVE that price level
- Events arrive every 100ms (10/sec baseline)

---

## Performance Targets

| Metric | Target | Failure Threshold |
|--------|--------|-------------------|
| Messages/sec handled | 100+ | <10 causes lag |
| Avg latency (WS → DOM) | <10ms | >16.67ms (misses frame) |
| P95 latency | <16.67ms | >33ms (misses 2 frames) |
| Frame rate | 60fps stable | <55fps |
| Dropped frames | 0 under normal load | >5 per minute |
| Rows re-rendered per update | <5 | >15 (full re-render) |
| JS heap growth (60s) | <5MB | >20MB (memory leak) |
| Time to first render | <300ms | >1000ms |

---

## File Structure

```
orderbook-takehome/
├── SPEC.md                           # This file
├── README.md                         # Submission README
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx                      # React entry point
│   ├── App.tsx                       # Root component
│   ├── index.css                     # Global styles
│   │
│   ├── types/
│   │   ├── index.ts                  # Re-exports all types
│   │   ├── binance.ts                # Binance API types
│   │   ├── orderbook.ts              # Internal orderbook types
│   │   ├── metrics.ts                # Metrics types
│   │   └── messages.ts               # Worker message types
│   │
│   ├── worker/
│   │   ├── orderbook.worker.ts       # Main worker (dedicated)
│   │   ├── orderbook.shared-worker.ts # SharedWorker variant
│   │   ├── binance-ws.ts             # WebSocket connection logic
│   │   ├── orderbook-processor.ts    # Delta processing, sorting, slicing
│   │   └── sequence-manager.ts       # Update ID tracking, resync logic
│   │
│   ├── store/
│   │   ├── index.ts                  # Re-exports
│   │   └── orderbook.ts              # Zustand store
│   │
│   ├── hooks/
│   │   ├── index.ts                  # Re-exports
│   │   ├── useOrderbook.ts           # Main orderbook hook
│   │   ├── useMetrics.ts             # Metrics subscription
│   │   ├── useWorker.ts              # Worker lifecycle management
│   │   └── useRAFBridge.ts           # RAF loop for batching
│   │
│   ├── components/
│   │   ├── OrderBook/
│   │   │   ├── index.tsx             # Container component
│   │   │   ├── OrderBookRow.tsx      # Memoized row
│   │   │   ├── DepthBar.tsx          # CSS-based depth visualization
│   │   │   ├── Spread.tsx            # Spread display
│   │   │   └── OrderBook.css         # Styles
│   │   │
│   │   ├── MetricsPanel/
│   │   │   ├── index.tsx
│   │   │   └── MetricsPanel.css
│   │   │
│   │   ├── Controls/
│   │   │   ├── index.tsx             # Freeze/unfreeze, settings
│   │   │   └── Controls.css
│   │   │
│   │   └── StatusIndicator/
│   │       ├── index.tsx
│   │       └── StatusIndicator.css
│   │
│   └── lib/
│       ├── broadcast-channel.ts      # BroadcastChannel utilities
│       ├── leader-election.ts        # Tab leader election
│       └── perf-utils.ts             # Performance measurement helpers
│
├── scripts/
│   └── perf-test.ts                  # Automated performance testing
│
└── __tests__/
    ├── fixtures/
    │   ├── binance-depth-snapshot.json
    │   ├── binance-depth-update.json
    │   ├── expected-orderbook-slice.json
    │   └── expected-store-state.json
    │
    └── unit/
        ├── orderbook-processor.test.ts
        └── sequence-manager.test.ts
```

---

## Phase Implementation Plan

| Phase | Deliverable | Est. Time |
|-------|-------------|-----------|
| 0 | Project scaffold + all types + test fixtures | 15 min |
| 1 | Worker with mock data posting | 30 min |
| 2 | Worker + real Binance WS + sequence handling | 45 min |
| 3 | Zustand store + RAF bridge | 30 min |
| 4 | Basic UI (no optimization) | 30 min |
| 5 | Memoization + performance pass | 45 min |
| 6 | Metrics panel | 30 min |
| 7 | Freeze/unfreeze | 20 min |
| 8 | Multi-tab (BroadcastChannel) | 30 min |
| 9 | Multi-tab (SharedWorker) + feature flag | 30 min |
| 10 | Polish + README + screenshots | 45 min |

**Total: ~6 hours**

---

## Verification Commands

Run after every phase:

```bash
# Type check
pnpm tsc --noEmit

# Build
pnpm build

# Check for placeholder code (should be 0 results)
grep -rn "TODO" src/
grep -rn "FIXME" src/
grep -rn "placeholder" src/
grep -rn "implement later" src/

# Check for console.log (should only be in metrics/debug code)
grep -rn "console.log" src/

# Run tests
pnpm test

# Performance test (Phase 5+)
pnpm perf-test
```

---

## Anti-Hallucination Rules

1. **All types are defined in `src/types/`** — if you need a new type, add it there first
2. **No placeholder functions** — every function must be fully implemented or throw `new Error('Not implemented: [reason]')`
3. **No `// TODO` comments** — either implement it or don't include it
4. **No inline styles** — all styles in CSS files
5. **No anonymous arrow functions in JSX props** — breaks memoization
6. **No `any` type** — use `unknown` and narrow, or define proper type
7. **Import types from `@/types`** — never define interfaces inline in components

---

## Metrics Collection Points

```typescript
// In Worker: when message received from Binance
const wsReceiveTime = performance.now();

// In Worker: after processing, before postMessage
const workerProcessTime = performance.now() - wsReceiveTime;

// In Main: in onmessage handler
const mainReceiveTime = performance.now();
const workerToMainLatency = mainReceiveTime - message.workerTimestamp;

// In Main: in RAF callback after Zustand update
const rafTime = performance.now();
const totalLatency = rafTime - message.workerTimestamp;

// In Component: track re-renders
const renderCount = useRef(0);
renderCount.current++;

// In RAF loop: track frame timing
const lastFrameTime = useRef(performance.now());
const frameDelta = now - lastFrameTime.current;
if (frameDelta > 16.67) droppedFrames++;
```

---

## README Template (for submission)

```markdown
# Humidifi Orderbook Take-Home

## Quick Start

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

Open http://localhost:5173

## Architecture Decisions

### Why Web Worker for WebSocket?
[Explanation]

### Why Zustand?
[Explanation]

### Why RAF batching instead of throttle/debounce?
[Explanation]

### Multi-tab Approach
[Explanation of both modes]

## Performance Evidence

### React DevTools Profiler
[Screenshot showing <5 row re-renders per update]

### Chrome Performance Tab
[Screenshot showing 60fps, low JS heap]

### Metrics Panel
[Screenshot of live metrics]

## Tradeoffs Made

1. [Tradeoff 1]
2. [Tradeoff 2]

## What I'd Improve With More Time

1. [Improvement 1]
2. [Improvement 2]

## Bonus Features

- ✅ Freeze/unfreeze
- ✅ Multi-tab sync (both SharedWorker and BroadcastChannel)
- ✅ Performance metrics panel
```
