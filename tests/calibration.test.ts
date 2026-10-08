import { describe, expect, it } from "vitest";
import type { BlinkEvent, EarSample } from "../src/blinkDetector";
import { AdaptiveCalibration, ClosedFloorCalibration, mad, parabolicMin } from "../src/calibration";
import { computeAdaptiveLines } from "../src/adaptive";

function event(meanMin: number, baseline = 0.31): BlinkEvent {
  return {
    startMs: 0,
    endMs: 250,
    durationMs: 250,
    leftMin: meanMin,
    rightMin: meanMin,
    meanMin,
    baseline,
  };
}

function samples(preOpen: number, trough: number, both = true): { event: BlinkEvent; history: EarSample[] } {
  const dt = 1000 / 30;
  const history: EarSample[] = [];
  let t = 0;
  for (let i = 0; i < 20; i += 1) {
    history.push({ t, mean: preOpen, left: preOpen, right: preOpen });
    t += dt;
  }
  const startMs = t;
  const steps = 8;
  let leftMin = preOpen;
  let rightMin = preOpen;
  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const left = preOpen - (preOpen - trough) * Math.sin(Math.PI * x);
    const right = both ? left : preOpen;
    leftMin = Math.min(leftMin, left);
    rightMin = Math.min(rightMin, right);
    history.push({ t, mean: (left + right) / 2, left, right });
    t += dt;
  }
  return {
    event: {
      startMs,
      endMs: t,
      durationMs: t - startMs,
      leftMin,
      rightMin,
      meanMin: Math.min(leftMin, rightMin),
      baseline: preOpen,
    },
    history,
  };
}

describe("closed-floor calibration", () => {
  it("uses fallback r until 10 blinks and never blocks", () => {
    const cal = new ClosedFloorCalibration();
    expect(cal.r).toBe(0.23);
    expect(cal.complete).toBe(false);
    for (let i = 0; i < 9; i += 1) cal.record(event(0.07));
    expect(cal.count).toBe(9);
    expect(cal.complete).toBe(false);
    expect(cal.r).toBe(0.23);
    cal.record(event(0.07));
    expect(cal.complete).toBe(true);
    expect(cal.r).toBeCloseTo(0.07 / 0.31, 5);
  });
});

describe("adaptive calibration", () => {
  it("rejects shallow / one-eye outliers", () => {
    const cal = new AdaptiveCalibration(10);
    const shallow = samples(0.31, 0.2);
    const oneEye = samples(0.31, 0.07, false);
    const deep = samples(0.31, 0.07);
    expect(cal.consider(shallow.event, shallow.history, 0.26).accepted).toBe(false);
    expect(cal.consider(shallow.event, shallow.history, 0.26).message).toContain("shallow");
    expect(cal.consider(oneEye.event, oneEye.history, 0.26).accepted).toBe(false);
    expect(cal.consider(deep.event, deep.history, 0.26).accepted).toBe(true);
    expect(cal.count).toBe(1);
  });

  it("clamps r to [0.10, 0.45]", () => {
    const cal = new AdaptiveCalibration(5);
    for (let i = 0; i < 5; i += 1) {
      const deep = samples(0.31, 0.02);
      cal.consider(deep.event, deep.history, 0.26);
    }
    expect(cal.complete).toBe(true);
    expect(cal.r).toBeGreaterThanOrEqual(0.1);
    expect(cal.r).toBeLessThanOrEqual(0.45);
    const lines = computeAdaptiveLines(0.31, cal.r, 0);
    expect(lines.close).toBeGreaterThanOrEqual(0.45 * 0.31);
    expect(lines.close).toBeLessThanOrEqual(0.85 * 0.31);
  });

  it("warns when ratio spread (MAD) > 0.08", () => {
    const cal = new AdaptiveCalibration(10);
    for (let i = 0; i < 5; i += 1) {
      const low = samples(0.31, 0.04);
      cal.consider(low.event, low.history, 0.26);
    }
    for (let i = 0; i < 5; i += 1) {
      const high = samples(0.31, 0.16);
      cal.consider(high.event, high.history, 0.26);
    }
    expect(cal.complete).toBe(true);
    expect(cal.spread).toBeGreaterThan(0.08);
    expect(cal.inconsistent).toBe(true);
    expect(cal.label).toContain("inconsistent");
  });

  it("supports N = 5 and N = 10", () => {
    const five = new AdaptiveCalibration(5);
    const ten = new AdaptiveCalibration(10);
    for (let i = 0; i < 5; i += 1) {
      const blink = samples(0.31, 0.07);
      five.consider(blink.event, blink.history, 0.26);
      ten.consider(blink.event, blink.history, 0.26);
    }
    expect(five.complete).toBe(true);
    expect(ten.complete).toBe(false);
    for (let i = 0; i < 5; i += 1) {
      const blink = samples(0.31, 0.07);
      ten.consider(blink.event, blink.history, 0.26);
    }
    expect(ten.complete).toBe(true);
    expect(five.target).toBe(5);
    expect(ten.target).toBe(10);
  });

  it("refines a valley with a 3-point parabola", () => {
    const refined = parabolicMin(0.12, 0.07, 0.11);
    expect(refined).toBeLessThan(0.07);
    expect(mad([0.1, 0.2, 0.3])).toBeGreaterThan(0);
  });
});
