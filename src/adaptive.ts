export const CLOSE_FRAC_LEGACY = 0.7;
export const OPEN_FRAC_LEGACY = 0.84;
export const LEGACY_CLOSED_RATIO = 0.23;

export const F_CLOSE = (CLOSE_FRAC_LEGACY - LEGACY_CLOSED_RATIO) / (1 - LEGACY_CLOSED_RATIO);
export const F_OPEN = (OPEN_FRAC_LEGACY - LEGACY_CLOSED_RATIO) / (1 - LEGACY_CLOSED_RATIO);

export type AdaptiveLines = {
  close: number;
  open: number;
  noisy: boolean;
  floor: number;
};

/** close/open as fractions of live baseline B. r = 0.23 reproduces legacy 0.70 / 0.84. */
export function computeAdaptiveLines(baseline: number, r: number, sigmaOpen = 0): AdaptiveLines {
  const B = Math.max(baseline, 1e-6);
  const floor = B * r;
  let close = B * (r + F_CLOSE * (1 - r));
  let open = B * (r + F_OPEN * (1 - r));
  close = clamp(close, 0.45 * B, 0.85 * B);
  open = Math.max(open, close + 0.05 * B);
  let noisy = false;
  const minGap = 3 * Math.max(0, sigmaOpen);
  if (B - close < minGap) {
    close = B - minGap;
    close = clamp(close, 0.45 * B, 0.85 * B);
    open = Math.max(open, close + 0.05 * B);
    noisy = true;
  }
  return { close, open, noisy, floor };
}

export function sigmaOpenFrom(means: number[]): number {
  if (means.length < 5) return 0;
  return 1.4826 * madOf(means);
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function madOf(values: number[]): number {
  if (values.length === 0) return 0;
  const mid = medianOf(values);
  return medianOf(values.map((value) => Math.abs(value - mid)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
