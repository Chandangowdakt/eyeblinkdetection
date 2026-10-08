import { CLOSE_FRAC_LEGACY, OPEN_FRAC_LEGACY, computeAdaptiveLines, sigmaOpenFrom } from "./adaptive";
import {
  DEFAULT_STRICT_CONFIG,
  GAP_INTERVAL_MULT,
  LEGACY_MAX_BLINK_MS,
  LEGACY_MIN_BLINK_MS,
  LEGACY_MIN_CLOSED_FRAMES,
  durationRejectReason,
  emptyRejectionCounts,
  winkRejects,
  type RejectedEvent,
  type RejectionCounts,
  type RejectionReason,
  type StrictValidationConfig,
} from "./eventValidation";
import { FrameIntervalEstimator } from "./intervalEstimator";
import { SlidingWindow } from "./slidingWindow";
import { FRAME_INTERVAL_30_MS, VALLEY_MS, WARMUP_MS, framesFromMs } from "./timing";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type EarSample = {
  t: number;
  mean: number;
  left: number;
  right: number;
};

export type BlinkEvent = {
  startMs: number;
  endMs: number;
  durationMs: number;
  leftMin: number;
  rightMin: number;
  meanMin: number;
  baseline: number;
  leftBaseline?: number;
  rightBaseline?: number;
};

export type BlinkSnapshot = {
  blinkCount: number;
  closed: boolean;
  tilted: boolean;
  moving: boolean;
  calibrated: boolean;
  justBlinked: boolean;
  event: BlinkEvent | null;
  left: number;
  right: number;
  mean: number;
  avg: number;
  min: number;
  max: number;
  baseline: number;
  closeThreshold: number;
  openThreshold: number;
};

/**
 * Research-backed blink validator:
 * Soukupová & Čech EAR + 13-frame valley, PyImageSearch consecutive frames,
 * per-subject open-eye baseline, duration 50–700 ms, motion/yaw reject.
 */
export class BlinkDetector {
  private static readonly SMOOTH_LEN = 3;
  private static readonly CLOSE_FRAC = CLOSE_FRAC_LEGACY;
  private static readonly OPEN_FRAC = OPEN_FRAC_LEGACY;
  private static readonly DROP_FRAC = 0.78;
  private static readonly MIN_CLOSED_FRAMES = LEGACY_MIN_CLOSED_FRAMES;
  private static readonly MIN_BLINK_MS = LEGACY_MIN_BLINK_MS;
  private static readonly MAX_BLINK_MS = LEGACY_MAX_BLINK_MS;
  private static readonly MIN_BLINK_GAP_MS = 160;
  private static readonly TILT_RATIO = 0.32;

  blinkCount = 0;
  closed = false;
  tilted = false;
  moving = false;
  calibrated = false;
  closeThreshold = 0.2;
  openThreshold = 0.24;
  baseline = 0.3;

  left = 0;
  right = 0;
  mean = 0;
  avg = 0;
  min = 0;
  max = 0;

  private readonly leftOpen = new SlidingWindow(90);
  private readonly rightOpen = new SlidingWindow(90);
  private readonly leftTrace = new SlidingWindow(90);
  private readonly rightTrace = new SlidingWindow(90);
  private readonly meanTrace = new SlidingWindow(90);
  private readonly smoothBuf: number[] = [];
  private closedStartedAt = 0;
  private closedFrames = 0;
  private lastBlinkAt = 0;
  private troughLeft = Number.POSITIVE_INFINITY;
  private troughRight = Number.POSITIVE_INFINITY;
  private troughMean = Number.POSITIVE_INFINITY;
  private readonly events: BlinkEvent[] = [];
  private lastEvent: BlinkEvent | null = null;
  private intervalMs = FRAME_INTERVAL_30_MS;
  private readonly intervalEstimator = new FrameIntervalEstimator();
  private closeFrac = BlinkDetector.CLOSE_FRAC;
  private adaptiveR: number | null = null;
  private readonly history: EarSample[] = [];
  signalNoisy = false;
  private strict: StrictValidationConfig = { ...DEFAULT_STRICT_CONFIG };
  private readonly rejectionCounts: RejectionCounts = emptyRejectionCounts();
  private readonly rejected: RejectedEvent[] = [];
  private lastFrameMs = 0;
  private mustReopen = false;
  private minBlinkMs = BlinkDetector.MIN_BLINK_MS;
  private maxBlinkMs = BlinkDetector.MAX_BLINK_MS;

  get blinkEvents(): readonly BlinkEvent[] {
    return this.events;
  }

  get lastBlinkEvent(): BlinkEvent | null {
    return this.lastEvent;
  }

  get earHistory(): readonly EarSample[] {
    return this.history;
  }

  get leftOpenBaseline(): number {
    return this.leftOpen.stats().p80;
  }

  get rightOpenBaseline(): number {
    return this.rightOpen.stats().p80;
  }

  get rejections(): RejectionCounts {
    return { ...this.rejectionCounts };
  }

  get rejectedEvents(): readonly RejectedEvent[] {
    return this.rejected;
  }

  setStrictValidation(config: StrictValidationConfig | null): void {
    this.strict = config ? { ...config } : { ...DEFAULT_STRICT_CONFIG };
  }

  setAdaptiveClosedRatio(r: number | null): void {
    this.adaptiveR = r;
    if (r == null) this.signalNoisy = false;
    if (this.calibrated) this.applyThresholds();
  }

  /** Personal duration gate. Null restores the legacy 50–700 ms window. */
  setDurationWindow(minMs: number | null, maxMs?: number | null): void {
    if (minMs == null || maxMs == null) {
      this.minBlinkMs = BlinkDetector.MIN_BLINK_MS;
      this.maxBlinkMs = BlinkDetector.MAX_BLINK_MS;
      return;
    }
    const lo = Math.max(BlinkDetector.MIN_BLINK_MS, Math.min(minMs, maxMs));
    const hi = Math.min(BlinkDetector.MAX_BLINK_MS, Math.max(minMs, maxMs));
    this.minBlinkMs = lo;
    this.maxBlinkMs = Math.max(lo + 80, hi);
  }

  get durationWindow(): { minMs: number; maxMs: number } {
    return { minMs: this.minBlinkMs, maxMs: this.maxBlinkMs };
  }

  get timingWindows(): { intervalMs: number; valleyFrames: number; warmupFrames: number } {
    return {
      intervalMs: this.intervalMs,
      valleyFrames: this.valleyFrameCount(),
      warmupFrames: this.warmupFrameCount(),
    };
  }

  setCustomStartLine(frac: number | null): void {
    this.closeFrac = frac == null ? BlinkDetector.CLOSE_FRAC : frac;
    if (this.calibrated) this.applyThresholds();
  }

  resetCount(): void {
    this.blinkCount = 0;
    this.closed = false;
    this.closedFrames = 0;
    this.closedStartedAt = 0;
    this.lastBlinkAt = 0;
    this.events.length = 0;
    this.lastEvent = null;
    this.lastFrameMs = 0;
    this.mustReopen = false;
    this.resetRejections();
    this.resetTrough();
  }

  resetSession(): void {
    this.resetCount();
    this.calibrated = false;
    this.tilted = false;
    this.moving = false;
    this.leftOpen.reset();
    this.rightOpen.reset();
    this.leftTrace.reset();
    this.rightTrace.reset();
    this.meanTrace.reset();
    this.smoothBuf.length = 0;
    this.closeThreshold = 0.2;
    this.openThreshold = 0.24;
    this.baseline = 0.3;
    this.avg = 0;
    this.min = 0;
    this.max = 0;
    this.intervalEstimator.reset();
    this.intervalMs = FRAME_INTERVAL_30_MS;
    this.history.length = 0;
    this.signalNoisy = false;
    this.minBlinkMs = BlinkDetector.MIN_BLINK_MS;
    this.maxBlinkMs = BlinkDetector.MAX_BLINK_MS;
  }

  lostFace(): void {
    this.noteInvalidFrame("faceLost");
  }

  noteInvalidFrame(reason: RejectionReason, atMs = 0): void {
    this.abortInProgress(reason, atMs);
  }

  private resetTrough(): void {
    this.troughLeft = Number.POSITIVE_INFINITY;
    this.troughRight = Number.POSITIVE_INFINITY;
    this.troughMean = Number.POSITIVE_INFINITY;
  }

  private noteTrough(): void {
    this.troughLeft = Math.min(this.troughLeft, this.left);
    this.troughRight = Math.min(this.troughRight, this.right);
    this.troughMean = Math.min(this.troughMean, this.mean);
  }

  observe(left: number, right: number): BlinkSnapshot {
    this.pushSignals(left, right, false);
    return this.snapshot(false);
  }

  update(left: number, right: number, nowMs: number, moving: boolean, frontal: boolean): BlinkSnapshot {
    const prevFrameMs = this.lastFrameMs;
    this.noteInterval(nowMs);
    this.moving = moving;
    this.pushSignals(left, right, true, nowMs);
    this.tilted = this.isTilted(this.left, this.right) || !frontal;
    this.lastFrameMs = nowMs;

    let justBlinked = false;
    if (!this.calibrated) {
      this.resetClosedState();
      return this.snapshot(false);
    }

    if (this.strict.enabled && this.closed) {
      if (prevFrameMs > 0 && nowMs - prevFrameMs > GAP_INTERVAL_MULT * this.intervalMs) {
        this.abortInProgress("gap", nowMs);
        return this.snapshot(false);
      }
      if (this.moving || !frontal) {
        this.abortInProgress("poseInvalid", nowMs);
        return this.snapshot(false);
      }
    }

    // Do not wipe an in-progress blink on one jitter frame.
    if (!this.strict.enabled && (this.tilted || this.moving) && !this.closed) {
      return this.snapshot(false);
    }

    const leftBase = Math.max(this.leftOpen.stats().p80, 0.2);
    const rightBase = Math.max(this.rightOpen.stats().p80, 0.2);
    const leftClosed = this.left < leftBase * BlinkDetector.DROP_FRAC;
    const rightClosed = this.right < rightBase * BlinkDetector.DROP_FRAC;
    const meanClosed = this.mean < this.closeThreshold;
    const bothClosed = meanClosed && (leftClosed || rightClosed) && this.left < leftBase * 0.9 && this.right < rightBase * 0.9;
    const bothOpen = this.mean > this.openThreshold;

    if (bothOpen) this.mustReopen = false;

    if (!this.closed && bothClosed && !this.mustReopen) {
      this.closed = true;
      this.closedFrames = 1;
      this.closedStartedAt = nowMs;
      this.resetTrough();
      this.noteTrough();
    } else if (this.closed && bothClosed) {
      this.closedFrames += 1;
      this.noteTrough();
    } else if (this.closed && bothOpen) {
      justBlinked = this.tryCompleteBlink(nowMs);
    }

    return this.snapshot(justBlinked);
  }

  private tryCompleteBlink(nowMs: number): boolean {
    const duration = nowMs - this.closedStartedAt;
    const minMs = this.strict.enabled ? this.strict.minMs : this.minBlinkMs;
    const maxMs = this.strict.enabled ? this.strict.maxMs : this.maxBlinkMs;
    const durationReason = durationRejectReason(duration, minMs, maxMs);
    const framesOk = this.strict.enabled || this.closedFrames >= BlinkDetector.MIN_CLOSED_FRAMES;
    if (durationReason || !framesOk) {
      this.abortInProgress(durationReason ?? "tooShort", nowMs);
      return false;
    }

    if (this.strict.enabled) {
      const nLeft = this.troughLeft / Math.max(this.leftOpenBaseline, 1e-6);
      const nRight = this.troughRight / Math.max(this.rightOpenBaseline, 1e-6);
      if (winkRejects(nLeft, nRight, this.strict.dipMax, this.strict.asymMax)) {
        this.abortInProgress("wink", nowMs);
        return false;
      }
    }

    const spaced = nowMs - this.lastBlinkAt >= BlinkDetector.MIN_BLINK_GAP_MS;
    const valley = this.hasBlinkValley();
    const poseOk = this.strict.enabled || !this.tilted;
    if (spaced && valley && poseOk) {
      this.blinkCount += 1;
      this.lastBlinkAt = nowMs;
      this.lastEvent = {
        startMs: this.closedStartedAt,
        endMs: nowMs,
        durationMs: duration,
        leftMin: this.troughLeft,
        rightMin: this.troughRight,
        meanMin: this.troughMean,
        baseline: this.baseline,
        leftBaseline: this.leftOpenBaseline,
        rightBaseline: this.rightOpenBaseline,
      };
      this.events.push(this.lastEvent);
      this.resetClosedState();
      return true;
    }

    if (!this.strict.enabled && this.tilted) this.recordRejection("poseInvalid", nowMs, duration);
    this.resetClosedState();
    return false;
  }

  private abortInProgress(reason: RejectionReason, atMs = 0): void {
    if (this.closed) {
      const durationMs = this.closedStartedAt > 0 && atMs > this.closedStartedAt ? atMs - this.closedStartedAt : 0;
      this.recordRejection(reason, atMs, durationMs);
      if (this.strict.enabled) this.mustReopen = true;
    }
    this.resetClosedState();
  }

  private resetClosedState(): void {
    this.closed = false;
    this.closedFrames = 0;
    this.closedStartedAt = 0;
    this.resetTrough();
  }

  private recordRejection(reason: RejectionReason, atMs: number, durationMs: number): void {
    this.rejectionCounts[reason] += 1;
    this.rejected.push({ reason, atMs, durationMs });
  }

  private resetRejections(): void {
    const empty = emptyRejectionCounts();
    (Object.keys(empty) as Array<keyof RejectionCounts>).forEach((key) => {
      this.rejectionCounts[key] = 0;
    });
    this.rejected.length = 0;
  }

  private pushSignals(left: number, right: number, allowBaseline: boolean, nowMs?: number): void {
    const rawMean = (left + right) / 2;
    this.smoothBuf.push(rawMean);
    if (this.smoothBuf.length > BlinkDetector.SMOOTH_LEN) this.smoothBuf.shift();
    this.mean = mean(this.smoothBuf);
    this.left = left * 0.55 + (this.left || left) * 0.45;
    this.right = right * 0.55 + (this.right || right) * 0.45;

    this.leftTrace.push(this.left);
    this.rightTrace.push(this.right);
    this.meanTrace.push(this.mean);

    const leftStats = this.leftTrace.stats();
    const rightStats = this.rightTrace.stats();
    this.min = Math.min(leftStats.min, rightStats.min);
    this.max = Math.max(leftStats.max, rightStats.max);
    this.avg = (leftStats.avg + rightStats.avg) / 2;

    if (allowBaseline && this.mean > this.openThreshold * 0.95) {
      this.leftOpen.push(this.left);
      this.rightOpen.push(this.right);
    }

    if (nowMs != null) this.recordSample(nowMs);

    if (this.leftOpen.length >= this.warmupFrameCount()) {
      const leftBase = this.leftOpen.stats().p80;
      const rightBase = this.rightOpen.stats().p80;
      this.baseline = (leftBase + rightBase) / 2;
      this.applyThresholds();
      this.calibrated = true;
    }
  }

  private applyThresholds(): void {
    if (this.adaptiveR != null) {
      const opens = this.history.filter((sample) => sample.mean > this.openThreshold).map((sample) => sample.mean);
      const sigma = sigmaOpenFrom(opens);
      const lines = computeAdaptiveLines(this.baseline, this.adaptiveR, sigma);
      this.closeThreshold = lines.close;
      this.openThreshold = lines.open;
      this.signalNoisy = lines.noisy;
      return;
    }
    this.signalNoisy = false;
    this.closeThreshold = clamp(this.baseline * this.closeFrac, 0.15, 0.28);
    this.openThreshold = clamp(this.baseline * BlinkDetector.OPEN_FRAC, 0.18, 0.34);
    if (this.openThreshold <= this.closeThreshold) {
      this.openThreshold = this.closeThreshold + 0.03;
    }
  }

  private recordSample(nowMs: number): void {
    this.history.push({ t: nowMs, mean: this.mean, left: this.left, right: this.right });
    const cutoff = nowMs - 5000;
    while (this.history.length > 0 && (this.history[0]?.t ?? 0) < cutoff) this.history.shift();
  }

  private noteInterval(nowMs: number): void {
    this.intervalMs = this.intervalEstimator.push(nowMs);
  }

  private valleyFrameCount(): number {
    return framesFromMs(VALLEY_MS, this.intervalMs);
  }

  private warmupFrameCount(): number {
    return framesFromMs(WARMUP_MS, this.intervalMs);
  }

  private isTilted(left: number, right: number): boolean {
    const larger = Math.max(left, right, 1e-3);
    return Math.abs(left - right) / larger > BlinkDetector.TILT_RATIO;
  }

  /**
   * Live (causal) valley: eyes start open, dip, then recover.
   * Offline papers center ±6 frames; at reopen the min is near the end, not the middle.
   */
  private hasBlinkValley(): boolean {
    const series = this.meanTrace.recent(this.valleyFrameCount());
    if (series.length < 6) return true;

    let min = series[0];
    let minIndex = 0;
    for (let i = 1; i < series.length; i += 1) {
      if (series[i] < min) {
        min = series[i];
        minIndex = i;
      }
    }

    const start = mean(series.slice(0, 3));
    const end = series[series.length - 1] ?? min;
    const valleyDeep = min <= this.closeThreshold * 1.08;
    const notAStartSpike = minIndex >= 1;
    const recovered = end > min + 0.025;
    const startedOpen = start >= this.closeThreshold;
    return valleyDeep && notAStartSpike && recovered && startedOpen;
  }

  private snapshot(justBlinked: boolean): BlinkSnapshot {
    return {
      blinkCount: this.blinkCount,
      closed: this.closed,
      tilted: this.tilted,
      moving: this.moving,
      calibrated: this.calibrated,
      justBlinked,
      event: justBlinked ? this.lastEvent : null,
      left: this.left,
      right: this.right,
      mean: this.mean,
      avg: this.avg,
      min: this.min,
      max: this.max,
      baseline: this.baseline,
      closeThreshold: this.closeThreshold,
      openThreshold: this.openThreshold,
    };
  }
}
