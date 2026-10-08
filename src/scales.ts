export type ScaleLevel = "green" | "blue" | "orange" | "red";
export type ScaleSide = "low" | "high";
export type ScaleResult = { level: ScaleLevel; side?: ScaleSide; label: string };
export type ScaleView = { level: ScaleLevel | "grey"; side?: ScaleSide; label: string };

export type PartialScale = { kind: "partial" };
export type RateBounds = {
  veryLow: number;
  low: number;
  below: number;
  greenMax: number;
  above: number;
  high: number;
};
export type RateScale = { kind: "rate"; bounds: RateBounds };
export type Scale = PartialScale | RateScale;

export const PARTIAL_SCALE: PartialScale = { kind: "partial" };

export const RESTING_RATE_BOUNDS: RateBounds = {
  veryLow: 5,
  low: 8,
  below: 12,
  greenMax: 20,
  above: 25,
  high: 30,
};

export const SCREEN_RATE_BOUNDS: RateBounds = {
  veryLow: 2,
  low: 4,
  below: 6,
  greenMax: 15,
  above: 20,
  high: 25,
};

export const RATE_PRESETS = {
  resting: RESTING_RATE_BOUNDS,
  screen: SCREEN_RATE_BOUNDS,
} as const;

export type RatePresetName = keyof typeof RATE_PRESETS;

const HYSTERESIS = 0.5;

export function scaleLevel(value: number, scale: Scale): ScaleResult {
  if (scale.kind === "partial") return partialLevel(value);
  return rateLevel(value, scale.bounds);
}

export function scaleLevelWithHysteresis(
  value: number,
  scale: Scale,
  previous: ScaleResult | null,
  hysteresis = HYSTERESIS,
): ScaleResult {
  const next = scaleLevel(value, scale);
  if (!previous) return next;
  if (previous.level === next.level && previous.side === next.side) return previous;
  const band = bandRange(previous, scale);
  if (!band) return next;
  const lo = band.min - hysteresis;
  const hi = band.maxExclusive ? band.max + hysteresis : band.max + hysteresis;
  const inside = band.maxExclusive ? value >= lo && value < hi : value >= lo && value <= hi;
  return inside ? previous : next;
}

export function greyScaleView(): ScaleView {
  return { level: "grey", label: "" };
}

export function scaleView(
  value: number | null,
  scale: Scale,
  sufficient: boolean,
  previous: ScaleResult | null,
): { view: ScaleView; stored: ScaleResult | null } {
  if (!sufficient || value == null || Number.isNaN(value)) {
    return { view: greyScaleView(), stored: null };
  }
  const stored = scaleLevelWithHysteresis(value, scale, previous);
  return { view: stored, stored };
}

export const RATE_LAST_SPAN = 10;
export const PARTIAL_SEGMENT_EDGES = [0, 25, 50, 75, 100] as const;

export type MarkerPlacement = { ratio: number; segmentIndex: number };

export function rateSegmentEdges(bounds: RateBounds): number[] {
  return [0, bounds.veryLow, bounds.low, bounds.below, bounds.greenMax, bounds.above, bounds.high, bounds.high + RATE_LAST_SPAN];
}

export function colourSegmentIndex(result: ScaleResult, kind: Scale["kind"]): number {
  if (kind === "partial") {
    if (result.level === "green") return 0;
    if (result.level === "blue") return 1;
    if (result.level === "orange") return 2;
    return 3;
  }
  if (result.level === "red" && result.side === "low") return 0;
  if (result.level === "orange" && result.side === "low") return 1;
  if (result.level === "blue" && result.side === "low") return 2;
  if (result.level === "green") return 3;
  if (result.level === "blue" && result.side === "high") return 4;
  if (result.level === "orange" && result.side === "high") return 5;
  return 6;
}

export function markerPlacement(value: number, scale: Scale): MarkerPlacement {
  const edges = scale.kind === "partial" ? [...PARTIAL_SEGMENT_EDGES] : rateSegmentEdges(scale.bounds);
  const n = edges.length - 1;
  if (!Number.isFinite(value)) return { ratio: 0, segmentIndex: 0 };
  const result = scaleLevel(value, scale);
  const segmentIndex = colourSegmentIndex(result, scale.kind);
  const start = edges[segmentIndex] ?? 0;
  const end = edges[segmentIndex + 1] ?? start + 1;
  const t = clamp01((value - start) / Math.max(1e-6, end - start));
  return { ratio: clamp01((segmentIndex + t) / n), segmentIndex };
}

export function markerRatio(value: number, scale: Scale): number {
  return markerPlacement(value, scale).ratio;
}

export function rateSegmentWeights(_bounds: RateBounds): number[] {
  void _bounds;
  return [1, 1, 1, 1, 1, 1, 1];
}

function partialLevel(value: number): ScaleResult {
  if (value <= 25) return { level: "green", label: "Normal" };
  if (value <= 50) return { level: "blue", side: "high", label: "Above" };
  if (value <= 75) return { level: "orange", side: "high", label: "High" };
  return { level: "red", side: "high", label: "Very high" };
}

function rateLevel(value: number, b: RateBounds): ScaleResult {
  if (value < b.veryLow) return { level: "red", side: "low", label: "Very low" };
  if (value < b.low) return { level: "orange", side: "low", label: "Low" };
  if (value < b.below) return { level: "blue", side: "low", label: "Below" };
  if (value <= b.greenMax) return { level: "green", label: "Normal" };
  if (value <= b.above) return { level: "blue", side: "high", label: "Above" };
  if (value <= b.high) return { level: "orange", side: "high", label: "High" };
  return { level: "red", side: "high", label: "Very high" };
}

function bandRange(result: ScaleResult, scale: Scale): { min: number; max: number; maxExclusive: boolean } | null {
  if (scale.kind === "partial") {
    if (result.level === "green") return { min: 0, max: 25, maxExclusive: false };
    if (result.level === "blue") return { min: 25, max: 50, maxExclusive: false };
    if (result.level === "orange") return { min: 50, max: 75, maxExclusive: false };
    return { min: 75, max: 100, maxExclusive: false };
  }
  const b = scale.bounds;
  if (result.level === "red" && result.side === "low") return { min: Number.NEGATIVE_INFINITY, max: b.veryLow, maxExclusive: true };
  if (result.level === "orange" && result.side === "low") return { min: b.veryLow, max: b.low, maxExclusive: true };
  if (result.level === "blue" && result.side === "low") return { min: b.low, max: b.below, maxExclusive: true };
  if (result.level === "green") return { min: b.below, max: b.greenMax, maxExclusive: false };
  if (result.level === "blue" && result.side === "high") return { min: b.greenMax, max: b.above, maxExclusive: false };
  if (result.level === "orange" && result.side === "high") return { min: b.above, max: b.high, maxExclusive: false };
  if (result.level === "red" && result.side === "high") return { min: b.high, max: Number.POSITIVE_INFINITY, maxExclusive: false };
  return null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
