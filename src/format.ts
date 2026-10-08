export function formatPartialHeadline(percent: number | null): string {
  if (percent == null || Number.isNaN(percent)) return "—";
  return `${Math.round(percent)}%`;
}

export function formatPartialWindow(partial: number, m: number, unsure: number): string {
  if (m < 1) return "—";
  return `${partial} of ${m} in last 60 s (+${unsure} unsure)`;
}

export function formatPartialSession(partial: number, m: number): string {
  if (m < 1) return "Session —";
  const pct = Math.round((partial / m) * 100);
  return `Session ${pct}% (${partial} of ${m})`;
}

export function formatBlinkLogRow(
  n: number,
  klass: string,
  durationMs: number,
  closure: number,
  depth: number,
): string {
  return `#${n} ${klass} · ${Math.round(durationMs)} ms · closure ${Math.round(closure * 100)}% · drop ${Math.round(depth * 100)}%`;
}

export function formatClosedFloor(input: {
  complete: boolean;
  count: number;
  target: number;
  r: number;
  baseline: number;
}): string {
  if (!input.complete) return `Calibrating ${input.count}/${input.target}, blink fully`;
  const floor = input.r * input.baseline;
  return `Floor ${floor.toFixed(2)} (${Math.round(input.r * 100)}% of baseline), ${input.count}/${input.target} blinks`;
}

export function formatSubjectTiming(profile: {
  medianMs: number;
  minMs: number;
  maxMs: number;
  fullClosure: number;
} | null): string {
  if (!profile) return "";
  return `Typical blink ${Math.round(profile.medianMs)} ms (${profile.minMs}–${profile.maxMs} ms), full ≥ ${Math.round(profile.fullClosure * 100)}%`;
}

export function formatHeroRateValue(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function formatSessionAverage(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `session average, ${value.toFixed(1)} blinks / min`;
}

export function formatRejectedCount(total: number): string {
  return `Rejected events: ${total}`;
}

export function formatLowFpsBanner(fps: number): string {
  return `Low frame rate (${Math.round(fps)} fps). Fast blinks can be missed, and Partial % may read high. Close other apps and use good front lighting.`;
}

export function formatDetectorLines(baseline: number, closeThreshold: number, calibrated: boolean): string {
  const ratio = baseline > 1e-6 ? Math.round((closeThreshold / baseline) * 100) : 0;
  const mark = calibrated ? "" : "*";
  return `${baseline.toFixed(2)} / ${closeThreshold.toFixed(2)} (${ratio}%)${mark}`;
}

export function countingFooterText(
  valleyMs: number,
  minMs: number,
  maxMs: number,
  strictMinMs: number,
  strictMaxMs: number,
): string {
  const windowSec = (valleyMs / 1000).toFixed(1);
  return `Counting uses an eye-closure dip and recovery check (about ${windowSec} s window), a both-eyes check, and a blink length of ${minMs}-${maxMs} ms (${strictMinMs}-${strictMaxMs} ms with strict validation on).`;
}
