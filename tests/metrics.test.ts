import { describe, expect, it } from "vitest";
import type { BlinkEvent } from "../src/blinkDetector";
import { SessionMetrics } from "../src/metrics";

function blink(t: number, trough = 0.07): BlinkEvent {
  return {
    startMs: t,
    endMs: t + 250,
    durationMs: 250,
    leftMin: trough,
    rightMin: trough,
    meanMin: trough,
    baseline: 0.31,
  };
}

function extras(trough: number, msBelow: number, startMs: number, uncalibrated = true) {
  const B = 0.31;
  const history = [
    { t: startMs, mean: trough, left: trough, right: trough },
    { t: startMs + msBelow, mean: trough, left: trough, right: trough },
    { t: startMs + 250, mean: B, left: B, right: B },
  ];
  return {
    history,
    closeLine: 0.21,
    uncalibrated,
    r: 0.23,
    baselineOnset: B,
  };
}

function runValid(metrics: SessionMetrics, from: number, to: number, face = true, pose = true, dt = 1000 / 30) {
  for (let t = from; t <= to; t += dt) {
    metrics.noteFrame(t, face, pose);
  }
}

describe("session metrics validTime and labels", () => {
  it("excludes face/pose-invalid spans from validTime", () => {
    const metrics = new SessionMetrics();
    metrics.reset(0);
    runValid(metrics, 0, 1000, true, true);
    runValid(metrics, 1000, 2000, false, true);
    runValid(metrics, 2000, 3000, true, false);
    runValid(metrics, 3000, 4000, true, true);
    expect(metrics.validTimeMs).toBeGreaterThan(1800);
    expect(metrics.validTimeMs).toBeLessThan(2200);
  });

  it("shows — for rate until 30 s of valid time", () => {
    const metrics = new SessionMetrics();
    metrics.reset(0);
    runValid(metrics, 0, 20_000);
    metrics.add(blink(5000), 0.23, 0.8, extras(0.07, 200, 5000));
    expect(metrics.rollingRate(20_000)).toBe("—");
    expect(metrics.rollingRatePerMin(20_000)).toBeNull();
    runValid(metrics, 20_000, 31_000);
    expect(metrics.rollingRate(31_000)).not.toBe("—");
    expect(metrics.rollingRatePerMin(31_000)).not.toBeNull();
  });

  it("shows — and low-sample states for partial %", () => {
    const metrics = new SessionMetrics();
    metrics.reset(0);
    runValid(metrics, 0, 2000);
    expect(metrics.partialLabel()).toContain("—");
    expect(metrics.partialSampleState()).toBe("empty");
    expect(metrics.partialPercent()).toBeNull();
    for (let i = 0; i < 3; i += 1) {
      const t = 3000 + i * 400;
      metrics.add(blink(t, 0.16), 0.23, 0.8, extras(0.16, 200, t));
    }
    expect(metrics.partialSampleState()).toBe("low");
    expect(metrics.partialPercent()).toBeNull();
    expect(metrics.partialLabel().startsWith("—")).toBe(true);
    expect(metrics.partialLabel()).toContain("3 of 3 in last 60 s");
    for (let i = 0; i < 3; i += 1) {
      const t = 5000 + i * 400;
      metrics.add(blink(t, 0.16), 0.23, 0.8, extras(0.16, 200, t));
    }
    expect(metrics.partialSampleState()).toBe("ok");
    expect(metrics.partialPercent()).not.toBeNull();
    expect(metrics.partialLabel().startsWith("—")).toBe(false);
  });

  it("rolls the 60 s valid-time window off", () => {
    const metrics = new SessionMetrics();
    metrics.reset(0);
    runValid(metrics, 0, 5000);
    metrics.add(blink(4000), 0.23, 0.8, extras(0.07, 200, 4000));
    runValid(metrics, 5000, 70_000);
    metrics.add(blink(65_000), 0.23, 0.8, extras(0.07, 200, 65_000));
    const csv = metrics.toCsv();
    expect(csv).toContain("O_min");
    expect(metrics.events).toHaveLength(2);
    const rate = metrics.rollingRate(70_000);
    expect(rate).not.toBe("—");
    const firstStillInWindow = metrics.events[0]!.validMsAt >= metrics.validTimeMs - 60_000;
    expect(firstStillInWindow).toBe(false);
  });

  it("excludes unsure from partial % denominator", () => {
    const metrics = new SessionMetrics();
    metrics.reset(0);
    runValid(metrics, 0, 2000);
    metrics.add(blink(1000, 0.07), 0.23, 0.8, extras(0.07, 200, 1000));
    metrics.add(blink(1400, 0.16), 0.23, 0.8, extras(0.16, 200, 1400));
    metrics.add(blink(1800, 0.07), 0.23, 0.8, extras(0.07, 40, 1800));
    const label = metrics.partialLabel();
    expect(label).toContain("1 of 2 in last 60 s (+1 unsure)");
    expect(label.startsWith("—")).toBe(true);
    expect(metrics.events.filter((event) => event.class === "unsure")).toHaveLength(1);
    expect(metrics.toCsv()).toContain("lowConfidence");
    expect(metrics.toCsv()).toContain("uncalibrated");
  });
});
