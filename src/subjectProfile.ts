import type { BlinkEvent } from "./blinkDetector";
import { percentile } from "./calibration";
import { CLASSIFIER_FALLBACK_R, closure, openness } from "./classifier";
import { LEGACY_MAX_BLINK_MS, LEGACY_MIN_BLINK_MS } from "./eventValidation";

const FULL_CLOSURE_FLOOR = 0.55;
const FULL_CLOSURE_CAP = 0.8;
const MIN_SPAN_MS = 120;
const MIN_UPPER_MS = 320;
const MAX_LOWER_MS = 180;

export type SubjectProfile = {
  r: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  fullClosure: number;
  sampleCount: number;
};

/**
 * First-N blinks are treated as a personal template: closed-eye depth,
 * typical duration, and how “full” a full blink is for this face.
 */
export function buildSubjectProfile(samples: readonly BlinkEvent[]): SubjectProfile | null {
  if (samples.length < 1) return null;

  const ratios = samples.filter((sample) => sample.baseline > 1e-6).map((sample) => sample.meanMin / sample.baseline);
  const r = ratios.length > 0 ? percentile(ratios, 0.25) : CLASSIFIER_FALLBACK_R;

  const durations = samples.map((sample) => sample.durationMs);
  const medianMs = percentile(durations, 0.5);
  const p10 = percentile(durations, 0.1);
  const p90 = percentile(durations, 0.9);
  let minMs = clamp(Math.round(p10 * 0.75), LEGACY_MIN_BLINK_MS, MAX_LOWER_MS);
  let maxMs = clamp(Math.round(p90 * 1.4), MIN_UPPER_MS, LEGACY_MAX_BLINK_MS);
  if (maxMs - minMs < MIN_SPAN_MS) {
    maxMs = Math.min(LEGACY_MAX_BLINK_MS, minMs + 200);
  }

  const closures = samples.map((sample) => {
    const open = openness(sample.meanMin, sample.baseline, r);
    return closure(Math.min(1, Math.max(0, open)));
  });
  const fullClosure = clamp(Math.min(FULL_CLOSURE_CAP, percentile(closures, 0.2)), FULL_CLOSURE_FLOOR, FULL_CLOSURE_CAP);

  return {
    r,
    medianMs,
    minMs,
    maxMs,
    fullClosure,
    sampleCount: samples.length,
  };
}

export class SubjectCalibration {
  private readonly samples: BlinkEvent[] = [];
  private built: SubjectProfile | null = null;

  reset(): void {
    this.samples.length = 0;
    this.built = null;
  }

  record(event: BlinkEvent): void {
    if (this.built) return;
    this.samples.push(event);
  }

  finish(): SubjectProfile | null {
    this.built = buildSubjectProfile(this.samples);
    return this.built;
  }

  get profile(): SubjectProfile | null {
    return this.built;
  }

  get count(): number {
    return this.samples.length;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
