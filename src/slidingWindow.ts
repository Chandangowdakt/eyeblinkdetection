export class SlidingWindow {
  private readonly values: Float32Array;
  private write = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.values = new Float32Array(capacity);
  }

  push(value: number): void {
    this.values[this.write] = value;
    this.write = (this.write + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  reset(): void {
    this.write = 0;
    this.count = 0;
  }

  get length(): number {
    return this.count;
  }

  at(index: number): number {
    const start = this.count === this.capacity ? this.write : 0;
    return this.values[(start + index) % this.capacity];
  }

  recent(n: number): number[] {
    const take = Math.min(n, this.count);
    const out: number[] = [];
    for (let i = this.count - take; i < this.count; i += 1) {
      out.push(this.at(i));
    }
    return out;
  }

  stats(): { min: number; max: number; avg: number; p80: number } {
    if (this.count === 0) {
      return { min: 0, max: 0, avg: 0, p80: 0.3 };
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    const sorted = new Float32Array(this.count);

    for (let i = 0; i < this.count; i += 1) {
      const value = this.at(i);
      sorted[i] = value;
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    sorted.sort();
    const p80 = sorted[Math.min(this.count - 1, Math.floor(this.count * 0.8))] ?? 0.3;
    return { min, max, avg: sum / this.count, p80 };
  }
}
