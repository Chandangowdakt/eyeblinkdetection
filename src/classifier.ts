import type { EarSample } from "./blinkDetector";
import { parabolicMin } from "./calibration";

export type BlinkClass = "full" | "partial" | "none";
export type BlinkClassV2 = "full" | "partial" | "unsure";

export const CLASSIFIER_FALLBACK_R = 0.23;
export const UNSURE_BELOW_CLOSE_MS = 90;

/** openness = (EAR/baseline - r) / (1 - r), r = closed-floor ratio. */
export function openness(ear: number, baseline: number, closedRatio: number): number {
  if (baseline <= 1e-6) return 0;
  const denom = 1 - closedRatio;
  if (denom <= 1e-6) return 0;
  return (ear / baseline - closedRatio) / denom;
}

export function closure(opennessValue: number): number {
  return 1 - opennessValue;
}

export function classifyBlink(closureValue: number, fullThreshold = 0.8): BlinkClass {
  if (closureValue >= fullThreshold) return "full";
  if (closureValue >= 0.25) return "partial";
  return "none";
}

export function classifyTrough(troughEar: number, baseline: number, closedRatio: number, fullThreshold = 0.8): BlinkClass {
  const open = openness(troughEar, baseline, closedRatio);
  return classifyBlink(closure(open), fullThreshold);
}

export type ClassifiedBlink = {
  O_min: number;
  closure: number;
  class: BlinkClassV2;
  lowConfidence: boolean;
  perEyeMinL: number;
  perEyeMinR: number;
  asymmetry: number;
  uncalibrated: boolean;
};

export type ClassifyBlinkInput = {
  troughEar: number;
  baselineOnset: number;
  r: number;
  uncalibrated: boolean;
  fullBlinkClosure?: number;
  leftMin: number;
  rightMin: number;
  troughLeft?: number;
  troughRight?: number;
  msBelowClose?: number;
};

/** v2: closure = 1 - clamp(O_min, 0, 1). Full if >= threshold, else partial. Unsure if < 90 ms below close. */
export function classifyBlinkEvent(input: ClassifyBlinkInput): ClassifiedBlink {
  const r = input.uncalibrated ? CLASSIFIER_FALLBACK_R : input.r;
  const rawO = openness(input.troughEar, input.baselineOnset, r);
  const O_min = clamp01(rawO);
  const closureValue = 1 - O_min;
  const lowConfidence = (input.msBelowClose ?? Number.POSITIVE_INFINITY) < UNSURE_BELOW_CLOSE_MS;
  let klass: BlinkClassV2 = closureValue >= (input.fullBlinkClosure ?? 0.8) ? "full" : "partial";
  if (lowConfidence) klass = "unsure";
  const L = input.troughLeft ?? input.leftMin;
  const R = input.troughRight ?? input.rightMin;
  const B = input.baselineOnset;
  return {
    O_min,
    closure: closureValue,
    class: klass,
    lowConfidence,
    perEyeMinL: input.leftMin,
    perEyeMinR: input.rightMin,
    asymmetry: B > 1e-6 ? Math.abs(L - R) / B : 0,
    uncalibrated: input.uncalibrated,
  };
}

export function troughOfMeanEar(history: readonly EarSample[], startMs: number, endMs: number): {
  ear: number;
  left: number;
  right: number;
} | null {
  const window = history.filter((sample) => sample.t >= startMs && sample.t <= endMs);
  if (window.length === 0) return null;
  let minIndex = 0;
  for (let i = 1; i < window.length; i += 1) {
    if ((window[i]?.mean ?? Infinity) < (window[minIndex]?.mean ?? Infinity)) minIndex = i;
  }
  const atMin = window[minIndex];
  if (!atMin) return null;
  const yMinus = window[minIndex - 1]?.mean;
  const yPlus = window[minIndex + 1]?.mean;
  const ear = yMinus == null || yPlus == null ? atMin.mean : parabolicMin(yMinus, atMin.mean, yPlus);
  return { ear, left: atMin.left, right: atMin.right };
}

export function timeBelowCloseLine(
  history: readonly EarSample[],
  startMs: number,
  endMs: number,
  closeLine: number,
): number {
  let ms = 0;
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1];
    const cur = history[i];
    if (!prev || !cur) continue;
    if (cur.t < startMs || prev.t > endMs) continue;
    if (cur.mean >= closeLine) continue;
    const dt = cur.t - prev.t;
    if (dt > 0 && dt <= 250) ms += dt;
  }
  return ms;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
