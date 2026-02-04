# Bugs & Gotchas Log

Track issues encountered during implementation to inform edge case handling.

---

## Phase 2

### 1. Worker vs Main Thread `performance.now()` Origins
**Symptom:** Latency showing ~1000ms instead of <10ms

**Cause:** `performance.now()` in Worker starts from Worker creation time, not page load. Subtracting Worker timestamp from Main thread timestamp = meaningless value.

**Fix:** Measure only within same context — record `receiveTime` in main thread when message arrives, compare to RAF time in main thread.

**Lesson:** Never compare timestamps across Worker/Main thread boundaries without clock sync.

---

## Phase 3

### 2. Zustand `useShallow` Infinite Re-render Loop
**Symptom:** "Maximum update depth exceeded" error

**Cause:** Selector returning new object → new reference → triggers re-render → new selector call → new object → loop

```typescript
// BAD
useOrderbookStore(useShallow((s) => ({
  spread: s.spread,
  percent: s.spreadPercent,
})));
```

**Fix:** Select primitives directly, not objects:
```typescript
// GOOD
const spread = useOrderbookStore((s) => s.spread);
const percent = useOrderbookStore((s) => s.spreadPercent);
```

**Lesson:** Object selectors need stable references or primitive decomposition.

---

### 3. Empty Array Fallback Reference Instability
**Symptom:** Infinite re-render loop when orderbook is null

**Cause:** `?? []` creates new array reference every render

```typescript
// BAD: [] !== [] (different references each time)
getDisplayed(s)?.bids ?? []
```

**Fix:** Use stable empty array constant:
```typescript
// GOOD: EMPTY_LEVELS === EMPTY_LEVELS (same reference)
const EMPTY_LEVELS: PriceLevel[] = [];
getDisplayed(s)?.bids ?? EMPTY_LEVELS
```

**Lesson:** Fallback values in selectors must be referentially stable.

---

## Phase 4

*(No issues)*

---

## Phase 5

### 4. maxCumulative Invalidates All Memoized Rows
**Symptom:** Still dropping frames (~26ms) after adding React.memo to OrderBookRow

**Cause:** `maxCumulative` (used for depth bar width calculation) changes on almost every update because it's `Math.max(bids[14].cumulative, asks[14].cumulative)`. Since it's passed as a prop and checked in the comparator, ALL 30 rows re-render whenever it changes — defeating memoization entirely.

```typescript
// BAD: Strict equality means any tiny change triggers re-render
if (prev.maxCumulative !== next.maxCumulative) return false;
```

**Fix:** Only re-render if maxCumulative changed by >1% (imperceptible visual difference):
```typescript
// GOOD: Threshold-based comparison
if (prev.maxCumulative > 0 && next.maxCumulative > 0) {
  const percentChange = Math.abs(next.maxCumulative - prev.maxCumulative) / prev.maxCumulative;
  if (percentChange > 0.01) return false;  // Only re-render if >1% change
} else if (prev.maxCumulative !== next.maxCumulative) {
  return false;  // Edge case: one is 0
}
```

**Result:** Frame drops eliminated. Went from ~38fps to solid 60fps.

**Lesson:** Derived values that change frequently can defeat memoization. Use threshold comparisons for values that only need visual accuracy, not exact precision.

---

## Phase 6

### 5. RAF `now` Parameter Causes Negative Latency
**Symptom:** MIN latency showing -0.4ms to -6.5ms (impossible negative values)

**Cause:** `requestAnimationFrame(tick)` passes a `DOMHighResTimeStamp` to the callback — this is the **frame start** timestamp, computed before any callbacks execute. But `receiveTime` is set via `performance.now()` at actual message handler execution time. If a message arrives between frame start and callback execution: `receiveTime > rafNow`, giving negative latency.

```typescript
// BAD: RAF now is frame start time, not current time
const tick = (now: number) => {
  const latency = now - stateRef.current.receiveTime; // Can be negative!
};

// ALSO BAD: mixing — performance.now() for latency but RAF now for everything else
const tick = (now: number) => {
  const frameDelta = now - lastFrameTimeRef.current; // RAF clock
  const latency = performance.now() - stateRef.current.receiveTime; // perf clock
  if (now - lastMetricsUpdateRef.current >= 1000) { ... } // RAF clock again
};
```

**Fix:** Ignore RAF `now` entirely. Call `performance.now()` once at tick start:
```typescript
// GOOD: single consistent clock for everything
const tick = () => {
  const now = performance.now();
  const frameDelta = now - lastFrameTimeRef.current;
  const latency = now - stateRef.current.receiveTime; // Always positive
};
```

**Lesson:** The RAF callback `now` parameter and `performance.now()` are not interchangeable. RAF `now` is a snapshot from before callbacks run. When comparing timestamps across event boundaries (message handlers vs RAF callbacks), always use the same clock measured at actual execution time.

---

### 6. `RollingAverage.values` Getter Allocates on Every Call
**Symptom:** GC pressure contributing to frame drops

**Cause:** The `values` getter returned `[...this._values]` (a full array copy). Called every second for metrics, but also any time you accessed `tracker.values[tracker.values.length - 1]` to get the last value — copying 100 elements just to read one.

```typescript
// BAD: copies entire array to read last element
current: tracker.values[tracker.values.length - 1] ?? 0
```

**Fix:** Added `last` getter that reads directly without copying:
```typescript
// GOOD: no allocation
get last(): number {
  return this._values[this._values.length - 1] ?? 0;
}
```

**Lesson:** Getters that copy data structures should be avoided in hot paths. Provide targeted accessors for common operations.

---

## Phase 8

### 7. Follower Tab Stuck at "Connecting" Status
**Symptom:** Follower tab shows "connecting" forever while leader shows "connected"

**Cause:** Leader broadcasts `STATUS_CHANGE: 'connected'` once when WebSocket first connects. Follower tabs opened *after* that moment miss it — no further `STATUS_CHANGE` is ever sent.

**Fix:** Follower infers connected status from data flow. On first `ORDERBOOK_UPDATE` received via BroadcastChannel, call `setConnectionStatus('connected')`.

**Lesson:** Late-joining subscribers miss one-time state transitions. Infer state from ongoing signals, not events you may have missed.

---

### 8. Cross-Tab `performance.now()` Causes -62873ms Latency
**Symptom:** Follower shows -62873ms latency and corrupted metrics

**Cause:** Initial fix for "follower reports lower latency" tried passing `performance.now()` from the leader tab through BroadcastChannel as `leaderReceiveTime`. But `performance.now()` has a **per-tab origin** — each tab's clock starts from its own navigation start. Leader open 63s: `performance.now() ≈ 63000`. Follower just opened: `performance.now() ≈ 200`. Follower computes `200 - 63000 = -62800ms`.

This is the same class of bug as #1 (Worker vs Main Thread timestamps) — `performance.now()` origins differ across execution contexts.

```typescript
// BAD: cross-tab performance.now() — different origins!
// Leader stamps: leaderReceiveTime = 63000 (leader's clock)
// Follower computes: latency = 200 - 63000 = -62800ms
stateRef.current.receiveTime = receiveTimeOverride ?? performance.now();
```

**Fix:** Don't pass timestamps across tabs. Each tab measures its own local latency — time from BroadcastChannel/Worker delivery to RAF paint. The follower's latency measures "channel delivery → DOM update", not the full pipeline. This is the only meaningful measurement without a shared clock.

```typescript
// GOOD: always use local performance.now()
stateRef.current.receiveTime = performance.now();
```

**Lesson:** `performance.now()` is scoped per browsing context (tab/worker). Never pass it across tabs, workers, or iframes and expect subtraction to work. If you need cross-context timing, use `Date.now()` (shared wall clock, ~1ms resolution) or accept local-only measurements.

---

### 9. Tab Count Always Shows 1
**Symptom:** Both leader and follower show `tabCount: 1`

**Cause:** `tabCount` was hardcoded to `1` in `onBecomeLeader` and never updated. BroadcastChannel only flowed leader → follower. No mechanism for followers to announce their existence.

**Fix:** Two-way ping protocol. Followers send `TAB_PING` with their tabId every 2s. Leader tracks pings in a `Map<tabId, timestamp>`, prunes stale entries (>5s), computes `1 + followerPings.size`, broadcasts `TAB_COUNT` back to followers.

**Lesson:** Counting distributed participants requires bidirectional communication. Unidirectional broadcast can't count its audience.

---

### 10. FPS Drops to 54-56 With Two Tabs Open
**Symptom:** Leader tab drops from 60fps to ~55fps when a follower tab is open

**Cause:** Leader called `channel.broadcast()` (structured clone + `postMessage`) on every single worker message in the `onmessage` handler. At high message rates (~100/sec), that's ~100 structured clones of the entire orderbook slice per second, synchronously on the main thread in the hot path.

```typescript
// BAD: broadcasts every message — 100+ structured clones/sec
worker.onmessage = (event) => {
  handleMessageRef.current(msg);
  channelRef.current?.broadcast(msg, receiveTime); // expensive on every msg
};
```

**Fix:** Coalesce broadcasts using the same RAF pattern the bridge uses. `ORDERBOOK_UPDATE` messages set a `pendingBroadcastRef` and schedule a single `requestAnimationFrame`. Only the latest data gets broadcast once per frame (~60/sec instead of ~100+/sec).

```typescript
// GOOD: one broadcast per frame, matching what follower actually needs
pendingBroadcastRef.current = { msg, time: receiveTime };
if (broadcastRafRef.current === null) {
  broadcastRafRef.current = requestAnimationFrame(() => {
    channelRef.current?.broadcast(pending.msg, pending.time);
  });
}
```

**Lesson:** When a producer (worker messages) is faster than a consumer (RAF-throttled follower), coalesce at the broadcast point. Sending data the consumer will discard wastes main thread time.

---

### 11. Stale Code via Vite HMR on WSL2 Causes Phantom Performance Bugs
**Symptom:** Follower shows Messages/sec: 0, FPS: 55, 95ms max latency. Debug console.logs that were removed from source still appear in browser console.

**Cause:** Vite's file watcher relies on `inotify`, which doesn't propagate reliably across the WSL2 → Windows filesystem boundary (`/mnt/c/...`). File edits on disk don't trigger HMR updates. Even full page reloads serve cached modules from Vite's in-memory module graph — not the current files on disk.

The accumulated debug `console.log` statements (firing ~60/sec on every BroadcastChannel message) were still executing in the browser despite being removed from source. This caused:
- Main thread jank → FPS drops to 55
- Delayed message processing → 95ms max latency
- Lost/delayed BroadcastChannel deliveries → 0 msgs/sec

**Fix:** Kill and restart the Vite dev server to flush the module cache. Simple reload is insufficient.

```bash
# BAD: Page reload — Vite serves cached modules
# Ctrl+R or page.reload()

# GOOD: Full server restart to flush module cache
lsof -ti :5174 | xargs kill -9 && pnpm dev
```

**Lesson:** On WSL2 with `/mnt/c/` paths, never trust HMR or page reloads to pick up file changes. Always restart the dev server after editing files. Consider using `--force` flag or moving the project to the native Linux filesystem (`~/`) for reliable file watching.

---

## Common Patterns to Watch For

| Pattern | Risk | Mitigation |
|---------|------|------------|
| `?? []` or `?? {}` in selector | New reference each render | Use module-level constant |
| Object spread in selector | New reference each render | Select primitives |
| `useCallback` inside selector | Recreates on every render | Define selector outside component |
| Cross-context timestamps | Wrong time origin | Measure in same context |
| Inline arrow in JSX | Breaks memoization | Extract to named function |
| Inline style object | Breaks memoization | Use CSS classes or useMemo |
| RAF `now` vs `performance.now()` | Negative time deltas | Use `performance.now()` inside callback |
| Getter that copies array | GC pressure in hot paths | Add targeted accessors (`.last`, `.length`) |
| Late-join subscriber | Misses one-time events | Infer state from ongoing data signals |
| Cross-tab `performance.now()` | Different origins → negative deltas | Never pass across tabs; use local clock or `Date.now()` |
| Broadcast on every message | Unnecessary structured clones | Coalesce to one broadcast per RAF frame |
| Unidirectional broadcast | Can't count participants | Add ping/pong for bidirectional awareness |
| WSL2 `/mnt/c/` file edits | Vite HMR doesn't detect changes | Restart dev server after edits |

---

## Edge Cases to Test

- [ ] What happens when WebSocket disconnects mid-stream?
- [ ] What happens with 0 bids or 0 asks?
- [ ] What happens if snapshot fetch fails?
- [ ] What happens with sequence gap during high volatility?
- [ ] What happens if browser tab is backgrounded for 5+ minutes?
- [ ] What happens with very wide spread (illiquid market)?
- [ ] What happens at exactly 60fps boundary?
- [ ] What happens when leader tab closes — does follower become leader within 5s?
- [ ] What happens when 3+ tabs are open — does tab count track correctly?
- [ ] What happens when follower tab is backgrounded — does ping go stale?
- [ ] What happens with rapid tab open/close — does leader election thrash?