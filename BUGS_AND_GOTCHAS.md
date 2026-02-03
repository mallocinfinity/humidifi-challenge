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

---

## Edge Cases to Test

- [ ] What happens when WebSocket disconnects mid-stream?
- [ ] What happens with 0 bids or 0 asks?
- [ ] What happens if snapshot fetch fails?
- [ ] What happens with sequence gap during high volatility?
- [ ] What happens if browser tab is backgrounded for 5+ minutes?
- [ ] What happens with very wide spread (illiquid market)?
- [ ] What happens at exactly 60fps boundary?