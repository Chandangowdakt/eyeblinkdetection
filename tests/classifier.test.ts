import { describe, expect, it } from "vitest";
import {
  classifyBlink,
  classifyBlinkEvent,
  classifyTrough,
  closure,
  openness,
  troughOfMeanEar,
} from "../src/classifier";
import type { EarSample } from "../src/blinkDetector";

const DT = 1000 / 30;
const B = 0.31;
const R = 0.23;

function troughEarForClosure(targetClosure: number): number {
  const O = 1 - targetClosure;
  return B * (R + O * (1 - R));
}

function sampleClosedBlink(targetClosure: number, phaseMs: number, durationMs = 400): EarSample[] {
  const trough = troughEarForClosure(targetClosure);
  const samples: EarSample[] = [];
  let t = 0;
  for (let i = 0; i < 18; i += 1) {
    samples.push({ t, mean: B, left: B, right: B });
    t += DT;
  }
  const start = t;
  for (let tau = phaseMs; tau <= durationMs + 1e-6; tau += DT) {
    const x = Math.min(1, Math.max(0, tau / durationMs));
    const ear = B - (B - trough) * Math.sin(Math.PI * x);
    samples.push({ t, mean: ear, left: ear, right: ear });
    t += DT;
  }
  for (let i = 0; i < 10; i += 1) {
    samples.push({ t, mean: B, left: B, right: B });
    t += DT;
  }
  void start;
  return samples;
}

function classifyPhase(targetClosure: number, phaseMs: number) {
  const samples = sampleClosedBlink(targetClosure, phaseMs);
  const start = samples.find((s) => s.mean < B * 0.98)?.t ?? 0;
  const end = samples[samples.length - 5]?.t ?? start;
  const trough = troughOfMeanEar(samples, start - 20, end);
  return classifyBlinkEvent({
    troughEar: trough?.ear ?? troughEarForClosure(targetClosure),
    baselineOnset: B,
    r: R,
    uncalibrated: true,
    fullBlinkClosure: 0.8,
    leftMin: trough?.left ?? troughEarForClosure(targetClosure),
    rightMin: trough?.right ?? troughEarForClosure(targetClosure),
    troughLeft: trough?.left,
    troughRight: trough?.right,
    msBelowClose: 200,
  });
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("openness / closure classifier", () => {
  it("maps baseline EAR to openness 1 when r is the closed floor", () => {
    expect(openness(0.31, 0.31, 0.23)).toBeCloseTo(1, 5);
    expect(closure(1)).toBeCloseTo(0, 5);
  });

  it("maps a deep trough near r to openness ~0", () => {
    const open = openness(0.23 * 0.31, 0.31, 0.23);
    expect(open).toBeCloseTo(0, 5);
    expect(classifyBlink(closure(open))).toBe("full");
  });

  it("labels 80%+ closure as full and 25-80% as partial", () => {
    expect(classifyBlink(0.8)).toBe("full");
    expect(classifyBlink(0.5)).toBe("partial");
    expect(classifyBlink(0.1)).toBe("none");
  });

  it("classifies a 0.07 trough on a 0.31 baseline as full with fallback r", () => {
    expect(classifyTrough(0.07, 0.31, 0.23)).toBe("full");
  });
});

describe("classifier v2 phase sampling", () => {
  function agreement(target: number, expected: "full" | "partial"): { rate: number; n: number } {
    const rng = mulberry32(Math.round(target * 10_000));
    let hits = 0;
    const n = 100;
    for (let i = 0; i < n; i += 1) {
      const phase = rng() * DT;
      const result = classifyPhase(target, phase);
      if (result.class === expected) hits += 1;
    }
    return { rate: hits / n, n };
  }

  it("labels 0.95 as full and 0.60 / 0.45 as partial in at least 95% of phases", () => {
    expect(agreement(0.95, "full").rate).toBeGreaterThanOrEqual(0.95);
    expect(agreement(0.6, "partial").rate).toBeGreaterThanOrEqual(0.95);
    expect(agreement(0.45, "partial").rate).toBeGreaterThanOrEqual(0.95);
  });

  it("prints 0.85 borderline full agreement without asserting", () => {
    const { rate } = agreement(0.85, "full");
    // eslint-disable-next-line no-console
    console.log(`0.85 closure agreement as full: ${(rate * 100).toFixed(1)}% of 100 phases`);
    expect(rate).toBeGreaterThanOrEqual(0);
  });
});

