// Performance utilities - Phase 6

/** Calculate P95 from an array of values */
export function calculateP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(index, sorted.length - 1)];
}

/** Rolling average calculator */
export class RollingAverage {
  private _values: number[] = [];
  private _maxSize: number;

  constructor(maxSize: number = 100) {
    this._maxSize = maxSize;
  }

  add(value: number): void {
    this._values.push(value);
    if (this._values.length > this._maxSize) {
      this._values.shift();
    }
  }

  get average(): number {
    if (this._values.length === 0) return 0;
    return this._values.reduce((a, b) => a + b, 0) / this._values.length;
  }

  get min(): number {
    if (this._values.length === 0) return 0;
    return Math.min(...this._values);
  }

  get max(): number {
    if (this._values.length === 0) return 0;
    return Math.max(...this._values);
  }

  get p95(): number {
    return calculateP95(this._values);
  }

  get values(): number[] {
    return [...this._values];
  }

  clear(): void {
    this._values = [];
  }
}

/** Get heap memory usage (Chrome only) */
export function getHeapUsedMB(): number {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (memory) {
    return memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}
