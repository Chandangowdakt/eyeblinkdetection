import { FRAME_INTERVAL_30_MS } from "./timing";

const SAMPLE_WINDOW = 30;
const SNAP_FRAC = 0.12;
const HOLD_MS = 2000;
const MIN_DT = 8;
const MAX_DT = 80;

export class FrameIntervalEstimator {
  private readonly samples: number[] = [];
  private lastNowMs = 0;
  private applied = FRAME_INTERVAL_30_MS;
  private candidate: number | null = null;
  private candidateSinceMs = 0;

  reset(): void {
    this.samples.length = 0;
    this.lastNowMs = 0;
    this.applied = FRAME_INTERVAL_30_MS;
    this.candidate = null;
    this.candidateSinceMs = 0;
  }

  get intervalMs(): number {
    return this.applied;
  }

  push(nowMs: number): number {
    if (this.lastNowMs > 0) {
      const dt = nowMs - this.lastNowMs;
      if (dt >= MIN_DT && dt <= MAX_DT) {
        this.samples.push(dt);
        if (this.samples.length > SAMPLE_WINDOW) this.samples.shift();
        this.consider(nowMs);
      }
    }
    this.lastNowMs = nowMs;
    return this.applied;
  }

  private consider(nowMs: number): void {
    const next = snapTo30fps(median(this.samples));
    if (almostEqual(next, this.applied)) {
      this.candidate = null;
      this.candidateSinceMs = 0;
      return;
    }
    if (this.candidate == null || !almostEqual(next, this.candidate)) {
      this.candidate = next;
      this.candidateSinceMs = nowMs;
      return;
    }
    if (nowMs - this.candidateSinceMs > HOLD_MS) {
      this.applied = this.candidate;
      this.candidate = null;
      this.candidateSinceMs = 0;
    }
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return FRAME_INTERVAL_30_MS;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? FRAME_INTERVAL_30_MS;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function snapTo30fps(intervalMs: number): number {
  if (Math.abs(intervalMs - FRAME_INTERVAL_30_MS) / FRAME_INTERVAL_30_MS <= SNAP_FRAC) {
    return FRAME_INTERVAL_30_MS;
  }
  return intervalMs;
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.05;
}
