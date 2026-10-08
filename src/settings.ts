import { DEFAULT_STRICT_CONFIG, STRICT_ASYM_MAX, STRICT_DIP_MAX, STRICT_MAX_MS, STRICT_MIN_MS } from "./eventValidation";
import { RATE_PRESETS, RESTING_RATE_BOUNDS, type RateBounds, type RatePresetName } from "./scales";

export type AppSettings = {
  partialCandidates: boolean;
  recoveryLine: boolean;
  pitchGating: boolean;
  pitchLimit: number;
  fpsMode: 30 | 60;
  showOpenness: boolean;
  startLineFrac: number;
  fullBlinkClosure: number;
  useCustomStartLine: boolean;
  adaptiveThreshold: boolean;
  calibrationBlinks: 5 | 10;
  ratePreset: RatePresetName;
  rateBounds: RateBounds;
  strictEventValidation: boolean;
  strictMinMs: number;
  strictMaxMs: number;
  winkDipMax: number;
  winkAsymMax: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  partialCandidates: false,
  recoveryLine: false,
  pitchGating: false,
  pitchLimit: 25,
  fpsMode: 30,
  showOpenness: false,
  startLineFrac: 0.7,
  fullBlinkClosure: 0.8,
  useCustomStartLine: false,
  adaptiveThreshold: false,
  calibrationBlinks: 10,
  ratePreset: "resting",
  rateBounds: { ...RESTING_RATE_BOUNDS },
  strictEventValidation: false,
  strictMinMs: DEFAULT_STRICT_CONFIG.minMs,
  strictMaxMs: DEFAULT_STRICT_CONFIG.maxMs,
  winkDipMax: DEFAULT_STRICT_CONFIG.dipMax,
  winkAsymMax: DEFAULT_STRICT_CONFIG.asymMax,
};

const KEY = "blinksense-settings-v1";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, rateBounds: { ...DEFAULT_SETTINGS.rateBounds } };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      fpsMode: parsed.fpsMode === 60 ? 60 : 30,
      useCustomStartLine: parsed.useCustomStartLine === true,
      adaptiveThreshold: parsed.adaptiveThreshold === true,
      calibrationBlinks: parsed.calibrationBlinks === 5 ? 5 : 10,
      ratePreset: parsed.ratePreset === "screen" ? "screen" : "resting",
      rateBounds: sanitizeRateBounds(
        parsed.rateBounds,
        parsed.ratePreset === "screen" ? "screen" : "resting",
      ),
      strictEventValidation: parsed.strictEventValidation === true,
      strictMinMs: clampNum(parsed.strictMinMs, STRICT_MIN_MS, 20, 200),
      strictMaxMs: clampNum(parsed.strictMaxMs, STRICT_MAX_MS, 200, 1000),
      winkDipMax: clampNum(parsed.winkDipMax, STRICT_DIP_MAX, 0.5, 1),
      winkAsymMax: clampNum(parsed.winkAsymMax, STRICT_ASYM_MAX, 0.1, 1),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, rateBounds: { ...DEFAULT_SETTINGS.rateBounds } };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function sanitizeRateBounds(raw: unknown, preset: RatePresetName): RateBounds {
  const fallback = { ...RATE_PRESETS[preset] };
  if (!raw || typeof raw !== "object") return fallback;
  const src = raw as Partial<RateBounds>;
  const next: RateBounds = {
    veryLow: num(src.veryLow, fallback.veryLow),
    low: num(src.low, fallback.low),
    below: num(src.below, fallback.below),
    greenMax: num(src.greenMax, fallback.greenMax),
    above: num(src.above, fallback.above),
    high: num(src.high, fallback.high),
  };
  if (
    next.veryLow < next.low &&
    next.low < next.below &&
    next.below <= next.greenMax &&
    next.greenMax < next.above &&
    next.above < next.high
  ) {
    return next;
  }
  return fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = num(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}
