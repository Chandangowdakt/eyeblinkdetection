export type RejectionReason = "tooShort" | "tooLong" | "wink" | "faceLost" | "poseInvalid" | "gap";

export type RejectionCounts = Record<RejectionReason, number>;

export type RejectedEvent = {
  reason: RejectionReason;
  atMs: number;
  durationMs: number;
};

export type StrictValidationConfig = {
  enabled: boolean;
  minMs: number;
  maxMs: number;
  dipMax: number;
  asymMax: number;
};

export const LEGACY_MIN_BLINK_MS = 50;
export const LEGACY_MAX_BLINK_MS = 700;
export const LEGACY_MIN_CLOSED_FRAMES = 2;
export const STRICT_MIN_MS = 60;
export const STRICT_MAX_MS = 500;
export const STRICT_DIP_MAX = 0.8;
export const STRICT_ASYM_MAX = 0.35;
export const GAP_INTERVAL_MULT = 2.5;

export const DEFAULT_STRICT_CONFIG: StrictValidationConfig = {
  enabled: false,
  minMs: STRICT_MIN_MS,
  maxMs: STRICT_MAX_MS,
  dipMax: STRICT_DIP_MAX,
  asymMax: STRICT_ASYM_MAX,
};

export const REJECTION_REASONS: RejectionReason[] = [
  "tooShort",
  "tooLong",
  "wink",
  "faceLost",
  "poseInvalid",
  "gap",
];

export function emptyRejectionCounts(): RejectionCounts {
  return { tooShort: 0, tooLong: 0, wink: 0, faceLost: 0, poseInvalid: 0, gap: 0 };
}

export function durationRejectReason(durationMs: number, minMs: number, maxMs: number): "tooShort" | "tooLong" | null {
  if (durationMs < minMs) return "tooShort";
  if (durationMs > maxMs) return "tooLong";
  return null;
}

export function winkRejects(nLeft: number, nRight: number, dipMax: number, asymMax: number): boolean {
  return nLeft > dipMax || nRight > dipMax || Math.abs(nLeft - nRight) > asymMax;
}

export function formatRejectionSummary(counts: RejectionCounts): string {
  const total = REJECTION_REASONS.reduce((sum, reason) => sum + counts[reason], 0);
  const parts = REJECTION_REASONS.map((reason) => `${reason} ${counts[reason]}`);
  return `${total} · ${parts.join(" · ")}`;
}
