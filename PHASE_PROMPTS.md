# Claude Code Phase Prompts

Each phase is a separate Claude Code session. Copy the relevant phase prompt when starting that session.

---

## Phase 0: Project Scaffold + Types

### Context
Starting fresh. No code exists yet.

### Goal
Create project structure with all TypeScript types defined. No runtime code yet.

### Implement
1. Initialize Vite + React + TypeScript project
2. Install dependencies: `zustand`
3. Create all folders per SPEC.md file structure
4. Create all type files with complete interfaces from SPEC.md
5. Create empty component files with just type-safe props
6. Create test fixtures (copy from `__tests__/fixtures/`)
7. Configure `tsconfig.json` with strict mode, path aliases (`@/`)

### Do Not
- Write any runtime logic
- Write any React component bodies
- Write any Worker code

### Verification
```bash
pnpm tsc --noEmit  # Must pass with 0 errors
pnpm build         # Must complete (even if app is blank)
```

### Output
- All files exist per structure
- All types compile
- `pnpm dev` shows blank page without errors

---

## Phase 1: Worker with Mock Data

### Context
Types exist in `src/types/`. Project scaffolded. No runtime code yet.

### Goal
Worker posts mock orderbook data to main thread every 100ms.

### Read First
- SPEC.md (Worker section)
- src/types/orderbook.ts
- src/types/messages.ts
- __tests__/fixtures/expected-orderbook-slice.json

### Implement
1. `src/worker/orderbook.worker.ts`:
   - On 'CONNECT' message, start interval
   - Every 100ms, post mock `OrderbookSlice` matching fixture structure
   - On 'DISCONNECT', clear interval
2. `src/hooks/useWorker.ts`:
   - Create Worker instance
   - Handle Worker messages, log to console
   - Cleanup on unmount
3. `src/App.tsx`:
   - Use the hook
   - Display connection status text

### Do Not
- Connect to real WebSocket
- Implement Zustand store
- Build any UI components beyond status text

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Open console, see mock orderbook logs every 100ms
```

### Output
- Console shows `{type: 'ORDERBOOK_UPDATE', data: {...}}` every 100ms
- Data structure matches `expected-orderbook-slice.json`

---

## Phase 2: Worker + Real Binance WebSocket

### Context
Worker posts mock data. Types exist. Now connect to real Binance.

### Goal
Worker connects to Binance, handles sequence sync, posts real orderbook data.

### Read First
- SPEC.md (Binance Synchronization section)
- src/types/binance.ts
- __tests__/fixtures/binance-depth-snapshot.json
- __tests__/fixtures/binance-depth-update.json

### Implement
1. `src/worker/binance-ws.ts`:
   - WebSocket connection to `wss://stream.binance.us:9443/ws/btcusd@depth@100ms`
   - Exponential backoff reconnection (max 5 retries)
   - Message parsing with type guards
2. `src/worker/sequence-manager.ts`:
   - Buffer messages during initial sync
   - Fetch REST snapshot
   - Discard stale buffered messages
   - Detect sequence gaps, trigger resync
3. `src/worker/orderbook-processor.ts`:
   - Maintain `Map<string, number>` for bids and asks
   - Apply deltas (quantity 0 = remove)
   - Sort, slice top 15
   - Compute cumulative, depthPercent, spread
4. Update `src/worker/orderbook.worker.ts`:
   - Wire up all modules
   - Post status changes
   - Post processed orderbook slices

### Do Not
- Touch main thread code beyond logging
- Implement Zustand yet
- Build UI components

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Console shows real BTC/USD orderbook updating ~10x/sec
# Manual: Disconnect network, see reconnection attempts
# Manual: Check spread is ~$0.50-2.00 (realistic for BTC)
```

### Output
- Real orderbook data in console
- Status changes: connecting → syncing → connected
- Reconnection works

---

## Phase 3: Zustand Store + RAF Bridge

### Context
Worker posts real orderbook data. Need to get it into React state efficiently.

### Goal
RAF loop batches Worker updates into Zustand store.

### Read First
- SPEC.md (Zustand Store Types, Data Flow)
- src/types/orderbook.ts

### Implement
1. `src/store/orderbook.ts`:
   - Full Zustand store per SPEC.md interface
   - Actions: updateLiveOrderbook, freeze, unfreeze, setConnectionStatus, updateMetrics
   - Use `immer` middleware if helpful
2. `src/hooks/useRAFBridge.ts`:
   - Receive Worker messages into ref
   - Set dirty flag
   - RAF loop: if dirty, push to Zustand, reset flag
   - Track latency (workerTimestamp → now)
3. Update `src/hooks/useWorker.ts`:
   - Use RAF bridge instead of direct logging
4. `src/hooks/useOrderbook.ts`:
   - Selector hooks with shallow equality
   - `useOrderbookBids()`, `useOrderbookAsks()`, `useSpread()`, etc.

### Do Not
- Build UI components yet
- Implement freeze/unfreeze logic (just the action stubs)
- Implement metrics beyond basic latency

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: React DevTools shows Zustand store updating
# Manual: Console log in RAF shows updates batched (not every message)
```

### Output
- Zustand store contains live orderbook
- Updates happen at most 60x/sec (RAF capped)
- Latency logged to console

---

## Phase 4: Basic UI (No Optimization)

### Context
Zustand store has real data. Now render it.

### Goal
Functional orderbook UI. Performance optimization comes next phase.

### Read First
- SPEC.md (Component Props)
- src/types/orderbook.ts

### Implement
1. `src/components/OrderBook/index.tsx`:
   - Subscribe to store
   - Render bids (green) and asks (red)
   - 15 rows each side
2. `src/components/OrderBook/OrderBookRow.tsx`:
   - Display price, size, cumulative
   - Basic depth bar using CSS width
3. `src/components/OrderBook/Spread.tsx`:
   - Display spread value and percent
4. `src/components/StatusIndicator/index.tsx`:
   - Show connection status (colored dot + text)
5. `src/index.css`:
   - Basic dark theme
   - Monospace font for numbers
   - Green for bids, red for asks
6. `src/App.tsx`:
   - Compose all components

### Do Not
- Add React.memo yet
- Optimize anything
- Add metrics panel
- Add controls

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Orderbook visible and updating
# Manual: Spread shows between bids/asks
# Manual: Status indicator shows connected
```

### Output
- Functional orderbook displaying real data
- May have performance issues (expected, fixed next phase)

---

## Phase 5: Memoization + Performance Pass

### Context
UI works but may have unnecessary re-renders. Now optimize.

### Goal
React Profiler shows <5 row re-renders per update.

### Read First
- SPEC.md (Performance Targets, Anti-Hallucination Rules)
- Current component code

### Implement
1. `src/components/OrderBook/OrderBookRow.tsx`:
   - Wrap in `React.memo` with custom comparator
   - Comparator: `prev.level.price === next.level.price && prev.level.size === next.level.size`
   - Add render counter ref for debugging
2. `src/components/OrderBook/index.tsx`:
   - Use granular selectors (separate for bids, asks)
   - Memoize max cumulative calculation
3. `src/components/OrderBook/DepthBar.tsx`:
   - Use CSS custom property `--depth-width`
   - Add `transform: translateZ(0)` for GPU compositing
4. All components:
   - Remove any inline arrow functions in JSX
   - Remove any inline style objects
   - Move all styles to CSS files
5. `src/hooks/useOrderbook.ts`:
   - Ensure selectors use shallow equality

### Do Not
- Add new features
- Change data flow
- Add metrics panel yet

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: React DevTools Profiler - record 10 seconds
# Manual: Check "Highlight updates" - only changed rows flash
# Manual: Most updates should show <5 components re-rendered
```

### Output
- Screenshot of React Profiler showing efficient renders
- Smooth 60fps visual performance

---

## Phase 6: Metrics Panel

### Context
Performance optimized. Now expose metrics to UI.

### Goal
Display live performance metrics in a panel.

### Read First
- SPEC.md (Metrics types)
- src/types/metrics.ts

### Implement
1. Update `src/worker/orderbook.worker.ts`:
   - Count messages per second
   - Post metrics every 1 second
2. Update `src/hooks/useRAFBridge.ts`:
   - Track latency (current, avg, min, max, p95 over last 100 samples)
   - Track FPS (RAF calls per second)
   - Track dropped frames (delta > 16.67ms)
   - Update store metrics
3. `src/components/MetricsPanel/index.tsx`:
   - Display all metrics from store
   - Update `performance.memory.usedJSHeapSize` if available
   - Format numbers nicely
4. `src/lib/perf-utils.ts`:
   - P95 calculation helper
   - Rolling average helper
5. Console logging:
   - Log metrics every 5 seconds

### Do Not
- Add freeze/unfreeze yet
- Add multi-tab yet

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Metrics panel shows all values
# Manual: Console logs metrics every 5 seconds
# Manual: fps should show ~60, latency <10ms avg
```

### Output
- Metrics panel visible in UI
- All metrics populating correctly
- Console shows periodic metrics dump

---

## Phase 7: Freeze/Unfreeze

### Context
Core functionality complete. Add freeze feature.

### Goal
Button to freeze display while data continues streaming.

### Read First
- SPEC.md (Decision #10)
- src/store/orderbook.ts

### Implement
1. Update `src/store/orderbook.ts`:
   - `freeze()`: copy liveOrderbook to frozenOrderbook, set isFrozen
   - `unfreeze()`: clear frozenOrderbook, set isFrozen false
2. `src/hooks/useOrderbook.ts`:
   - `useDisplayedOrderbook()`: returns frozen if isFrozen, else live
3. `src/components/Controls/index.tsx`:
   - Freeze/Unfreeze toggle button
   - Show "Frozen at [timestamp]" when frozen
   - Visual indicator (e.g., blue border on orderbook)
4. Update `src/components/OrderBook/index.tsx`:
   - Use `useDisplayedOrderbook()` instead of live directly

### Do Not
- Stop the Worker or WebSocket when frozen
- Add multi-tab yet

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Click freeze - orderbook stops updating
# Manual: Metrics panel still shows messages coming in
# Manual: Click unfreeze - orderbook snaps to current state
```

### Output
- Freeze button works
- Data continues streaming in background
- Visual indication of frozen state

---

## Phase 8: Multi-Tab (BroadcastChannel)

### Context
Single-tab functionality complete. Add BroadcastChannel multi-tab sync.

### Goal
Leader tab shares orderbook data with other tabs via BroadcastChannel.

### Read First
- SPEC.md (Multi-Tab Architecture, Option B)
- src/types/messages.ts

### Implement
1. `src/lib/leader-election.ts`:
   - Use localStorage timestamp for leader election
   - Heartbeat every 2 seconds
   - Detect leader death (no heartbeat for 5 seconds)
   - Become leader if oldest living tab
2. `src/lib/broadcast-channel.ts`:
   - Create BroadcastChannel 'orderbook-sync'
   - Leader: broadcast orderbook updates
   - Follower: receive and apply to store
3. Update `src/hooks/useWorker.ts`:
   - Only create Worker if leader
   - Followers listen to BroadcastChannel instead
4. Update metrics:
   - Track tabCount
   - Track isLeader status

### Do Not
- Implement SharedWorker yet (next phase)
- Break existing single-tab functionality

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Open two tabs
# Manual: Both show same orderbook data
# Manual: Close leader tab, other tab becomes leader
# Manual: Metrics shows tabCount: 2
```

### Output
- Multi-tab sync works via BroadcastChannel
- Leader election works
- Handoff on leader close works

---

## Phase 9: Multi-Tab (SharedWorker) + Feature Flag

### Context
BroadcastChannel works. Add SharedWorker alternative with feature flag.

### Goal
Feature flag to switch between SharedWorker and BroadcastChannel modes.

### Read First
- SPEC.md (Multi-Tab Architecture, Option A)
- src/worker/orderbook.worker.ts

### Implement
1. `src/worker/orderbook.shared-worker.ts`:
   - SharedWorker version
   - Track connected ports
   - Broadcast to all ports
2. Update `src/hooks/useWorker.ts`:
   - Check URL param `?multiTabMode=sharedworker` or `broadcast`
   - Default to `broadcast` (better browser support)
   - Instantiate correct worker type
3. Update `src/components/Controls/index.tsx`:
   - Display current mode
   - Note: changing mode requires page reload
4. Update metrics:
   - Track which mode is active
   - SharedWorker: get port count from worker

### Do Not
- Auto-fallback (user explicitly chooses)
- Change BroadcastChannel implementation

### Verification
```bash
pnpm tsc --noEmit
pnpm build
# Manual: Default mode (broadcast) works
# Manual: Add ?multiTabMode=sharedworker - SharedWorker mode works
# Manual: Open multiple tabs in each mode, verify sync
# Manual: SharedWorker mode shows single WS connection in Network tab
```

### Output
- Both modes work
- Feature flag switches between them
- Metrics show current mode

---

## Phase 10: Polish + README + Screenshots

### Context
All features complete. Prepare for submission.

### Goal
Professional submission with documentation and evidence.

### Implement
1. `README.md`:
   - How to run
   - Architecture decisions (summarize from SPEC.md)
   - Tradeoffs made
   - What I'd improve with more time
   - Performance evidence section (placeholder for screenshots)
2. Code cleanup:
   - Remove all `console.log` except in metrics
   - Remove all `// DEBUG` comments
   - Ensure no TODOs remain
3. Capture screenshots:
   - React DevTools Profiler (10 second recording under load)
   - Chrome Performance tab (10 second recording)
   - Network tab showing WebSocket messages
   - App running with metrics panel visible
4. Create GIF:
   - Show orderbook updating in real-time
   - Show freeze/unfreeze
   - Show multi-tab sync
5. Final verification:
   - Fresh `pnpm install && pnpm build`
   - Test on Chrome and Firefox
   - Run for 5 minutes, check memory stability

### Verification
```bash
rm -rf node_modules
pnpm install
pnpm build
pnpm preview  # Test production build

grep -rn "TODO" src/      # 0 results
grep -rn "console.log" src/ | wc -l  # Only in metrics code
```

### Output
- Complete README with screenshots
- Clean codebase
- Production build works
- Ready to submit

---

## Phase Handoff Template

After completing each phase, create `PHASE_N_COMPLETE.md`:

```markdown
## Phase N Complete: [Name]

### Files created/modified:
- path/to/file.ts - [what was done]

### Verification results:
- [x] pnpm tsc --noEmit: PASS
- [x] pnpm build: PASS
- [x] grep TODO: 0 results
- [x] Manual test: [description]

### Metrics (if applicable):
- Messages/sec: X
- Avg latency: Xms
- FPS: X
- Rows re-rendered: X

### Known issues:
- None (or list them)

### Next phase ready:
- [Brief description of what next phase can build on]
```
