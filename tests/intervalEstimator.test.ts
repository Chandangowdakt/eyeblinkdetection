import { describe, expect, it } from "vitest";
import { FrameIntervalEstimator, median, snapTo30fps } from "../src/intervalEstimator";
import { FRAME_INTERVAL_30_MS } from "../src/timing";

describe("FrameIntervalEstimator", () => {
  it("snaps values within 12% of 33.3 ms", () => {
    expect(snapTo30fps(33)).toBe(FRAME_INTERVAL_30_MS);
    expect(snapTo30fps(29.4)).toBe(FRAME_INTERVAL_30_MS);
    expect(snapTo30fps(37.3)).toBe(FRAME_INTERVAL_30_MS);
    expect(snapTo30fps(1000 / 60)).not.toBe(FRAME_INTERVAL_30_MS);
  });

  it("uses the median of recent samples", () => {
    expect(median([29, 33, 37])).toBe(33);
    expect(median([30, 32, 34, 36])).toBe(33);
  });

  it("keeps 33.3 ms until a different interval persists more than 2 s", () => {
    const est = new FrameIntervalEstimator();
    const dt = 1000 / 60;
    let t = 0;
    for (let i = 0; i < 40; i += 1) {
      t += dt;
      est.push(t);
    }
    expect(est.intervalMs).toBe(FRAME_INTERVAL_30_MS);
    for (let i = 0; i < 100; i += 1) {
      t += dt;
      est.push(t);
    }
    expect(est.intervalMs).toBeCloseTo(dt, 5);
  });
});
