import type { BlinkEvent, EarSample } from "./blinkDetector";

const TARGET = 10;
const FALLBACK_R = 0.23;
const ACCEPT_RATIO = 0.55;
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.45;
const SPREAD_LIMIT = 0.08;
const PREOPEN_MS = 500;
const DIP_FRAC = 0.7;

export class ClosedFloorCalibration {
  private readonly ratios: number[] = [];
  private closedRatio = FALLBACK_R;

  reset(): void {
    this.ratios.length = 0;
    this.closedRatio = FALLBACK_R;
  }

  record(event: BlinkEvent): void {
    if (this.complete) return;
    if (event.baseline <= 1e-6) return;
    this.ratios.push(event.meanMin / event.baseline);
    if (this.ratios.length >= TARGET) {
      this.closedRatio = percentile(this.ratios, 0.25);
    }
  }

  get count(): number {
    return this.ratios.length;
  }

  get target(): number {
    return TARGET;
  }

  get complete(): boolean {
    return this.ratios.length >= TARGET;
  }

  get r(): number {
    return this.complete ? this.closedRatio : FALLBACK_R;
  }

  get label(): string {
    if (this.complete) return "Closed-floor calibrated";
    return `Calibrating ${this.count}/${TARGET}, blink fully at a natural pace`;
  }
}

export type AdaptiveAccept = {
  accepted: boolean;
  message: string;
  preOpen: number | null;
  trough: number | null;
  ratio: number | null;
};

export class AdaptiveCalibration {
  private readonly preOpens: number[] = [];
  private readonly ratios: number[] = [];
  private lastMessage = "";
  private closedRatio = FALLBACK_R;
  private bCal = 0;
  private madSpread = 0;
  private targetN: 5 | 10 = 10;

  constructor(target: 5 | 10 = 10) {
    this.targetN = target === 5 ? 5 : 10;
  }

  setTarget(target: 5 | 10): void {
    this.targetN = target === 5 ? 5 : 10;
  }

  reset(): void {
    this.preOpens.length = 0;
    this.ratios.length = 0;
    this.lastMessage = "";
    this.closedRatio = FALLBACK_R;
    this.bCal = 0;
    this.madSpread = 0;
  }

  consider(event: BlinkEvent, history: readonly EarSample[], openThreshold: number): AdaptiveAccept {
    if (this.complete) {
      return { accepted: false, message: this.label, preOpen: this.bCal, trough: this.floor, ratio: this.closedRatio };
    }

    const preOpen = medianOpenBefore(history, event.startMs, openThreshold);
    const trough = parabolicTrough(history, event.startMs, event.endMs);
    if (preOpen == null || trough == null || preOpen <= 1e-6) {
      this.lastMessage = `Calibrating ${this.count}/${this.targetN}`;
      return { accepted: false, message: this.lastMessage, preOpen, trough, ratio: null };
    }

    const ratio = trough / preOpen;
    const bothDipped = event.leftMin <= preOpen * DIP_FRAC && event.rightMin <= preOpen * DIP_FRAC;
    if (ratio > ACCEPT_RATIO || !bothDipped) {
      this.lastMessage = "That blink was shallow, blink fully";
      return { accepted: false, message: this.lastMessage, preOpen, trough, ratio };
    }

    this.preOpens.push(preOpen);
    this.ratios.push(ratio);
    if (this.preOpens.length >= this.targetN) {
      this.bCal = median(this.preOpens);
      this.closedRatio = clamp(percentile(this.ratios, 0.25), RATIO_MIN, RATIO_MAX);
      this.madSpread = mad(this.ratios);
      this.lastMessage = this.inconsistent
        ? "Calibration inconsistent, press Recalibrate"
        : `Calibrating ${this.targetN}/${this.targetN}`;
    } else {
      this.lastMessage = `Calibrating ${this.count}/${this.targetN}`;
    }
    return { accepted: true, message: this.lastMessage, preOpen, trough, ratio };
  }

  get count(): number {
    return this.ratios.length;
  }

  get target(): number {
    return this.targetN;
  }

  get complete(): boolean {
    return this.ratios.length >= this.targetN;
  }

  get r(): number {
    return this.complete ? this.closedRatio : FALLBACK_R;
  }

  get Bcal(): number {
    return this.bCal;
  }

  get spread(): number {
    return this.madSpread;
  }

  get inconsistent(): boolean {
    return this.complete && this.madSpread > SPREAD_LIMIT;
  }

  get floor(): number {
    return this.complete ? this.bCal * this.closedRatio : 0;
  }

  get label(): string {
    if (this.complete) {
      return this.inconsistent
        ? "Calibration inconsistent, press Recalibrate"
        : `Calibrating ${this.targetN}/${this.targetN}`;
    }
    return this.lastMessage || `Calibrating ${this.count}/${this.targetN}`;
  }

  liveLine(baseline: number, closeLine: number): string {
    const open = baseline;
    const floor = baseline * this.r;
    return `Open ${open.toFixed(2)}, floor ${floor.toFixed(2)}, close line ${closeLine.toFixed(2)}`;
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[index] ?? FALLBACK_R;
}

export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const mid = median(values);
  return median(values.map((value) => Math.abs(value - mid)));
}

export function parabolicMin(yMinus: number, y0: number, yPlus: number): number {
  const denom = yMinus - 2 * y0 + yPlus;
  if (denom <= 1e-12) return y0;
  return y0 - ((yPlus - yMinus) * (yPlus - yMinus)) / (8 * denom);
}

export function medianOpenBefore(history: readonly EarSample[], onsetMs: number, openThreshold: number): number | null {
  const opens: number[] = [];
  for (const sample of history) {
    if (sample.t >= onsetMs) break;
    if (sample.t < onsetMs - PREOPEN_MS) continue;
    if (sample.mean > openThreshold) opens.push(sample.mean);
  }
  if (opens.length === 0) return null;
  return median(opens);
}

export function parabolicTrough(history: readonly EarSample[], startMs: number, endMs: number): number | null {
  const window = history.filter((sample) => sample.t >= startMs && sample.t <= endMs);
  if (window.length === 0) return null;
  let minIndex = 0;
  for (let i = 1; i < window.length; i += 1) {
    if ((window[i]?.mean ?? Infinity) < (window[minIndex]?.mean ?? Infinity)) minIndex = i;
  }
  const y0 = window[minIndex]?.mean;
  if (y0 == null) return null;
  const yMinus = window[minIndex - 1]?.mean;
  const yPlus = window[minIndex + 1]?.mean;
  if (yMinus == null || yPlus == null) return y0;
  return parabolicMin(yMinus, y0, yPlus);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
