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

*(To be filled as issues arise)*

---

## Phase 5

*(To be filled as issues arise)*

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

---

## Edge Cases to Test

- [ ] What happens when WebSocket disconnects mid-stream?
- [ ] What happens with 0 bids or 0 asks?
- [ ] What happens if snapshot fetch fails?
- [ ] What happens with sequence gap during high volatility?
- [ ] What happens if browser tab is backgrounded for 5+ minutes?
- [ ] What happens with very wide spread (illiquid market)?
- [ ] What happens at exactly 60fps boundary?