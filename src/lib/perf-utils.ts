// Performance utilities

/** Calculate P95 from an array of values */
export function calculateP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(index, sorted.length - 1)];
}

/** Rolling average calculator with bounded storage */
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

  /** Get last value without copying the array */
  get last(): number {
    return this._values[this._values.length - 1] ?? 0;
  }

  get length(): number {
    return this._values.length;
  }

  clear(): void {
    this._values = [];
  }
}
