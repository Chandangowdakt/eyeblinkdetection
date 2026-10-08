import { describe, expect, it } from "vitest";
import type { BlinkEvent } from "../src/blinkDetector";
import { BlinkDetector } from "../src/blinkDetector";
import { LEGACY_MAX_BLINK_MS, LEGACY_MIN_BLINK_MS } from "../src/eventValidation";
import { parseFrameCsv, replayRows } from "../src/replay";
import { buildSubjectProfile, SubjectCalibration } from "../src/subjectProfile";
import { syntheticFullBlink, syntheticTwoFullBlinks } from "./fixtures/generate";
import golden from "./golden.json";

function sample(durationMs: number, meanMin = 0.07, baseline = 0.31): BlinkEvent {
  return {
    startMs: 0,
    endMs: durationMs,
    durationMs,
    leftMin: meanMin,
    rightMin: meanMin,
    meanMin,
    baseline,
  };
}

describe("subject blink profile", () => {
  it("learns duration and closed-floor from the first 10 blinks", () => {
    const samples = Array.from({ length: 10 }, () => sample(200, 0.07, 0.31));
    const profile = buildSubjectProfile(samples);
    expect(profile).not.toBeNull();
    expect(profile!.sampleCount).toBe(10);
    expect(profile!.r).toBeCloseTo(0.07 / 0.31, 5);
    expect(profile!.medianMs).toBe(200);
    expect(profile!.minMs).toBeGreaterThanOrEqual(LEGACY_MIN_BLINK_MS);
    expect(profile!.maxMs).toBeLessThanOrEqual(LEGACY_MAX_BLINK_MS);
    expect(profile!.minMs).toBeLessThan(profile!.maxMs);
    expect(profile!.fullClosure).toBeLessThanOrEqual(0.8);
    expect(profile!.fullClosure).toBeGreaterThanOrEqual(0.55);
  });

  it("widens the window around a slower blinker without leaving 50–700 ms", () => {
    const samples = [180, 220, 260, 300, 340, 380, 420, 460, 500, 540].map((ms) => sample(ms));
    const profile = buildSubjectProfile(samples)!;
    expect(profile.medianMs).toBeGreaterThan(300);
    expect(profile.maxMs).toBeGreaterThan(profile.minMs);
    expect(profile.minMs).toBeGreaterThanOrEqual(LEGACY_MIN_BLINK_MS);
    expect(profile.maxMs).toBeLessThanOrEqual(LEGACY_MAX_BLINK_MS);
  });

  it("stops recording after finish so later blinks do not reshape the template", () => {
    const cal = new SubjectCalibration();
    for (let i = 0; i < 10; i += 1) cal.record(sample(180));
    const first = cal.finish();
    cal.record(sample(600));
    expect(cal.profile).toEqual(first);
    expect(cal.count).toBe(10);
  });
});

describe("personal duration window on the detector", () => {
  it("keeps the legacy 50–700 ms window until setDurationWindow is called", () => {
    const detector = new BlinkDetector();
    detector.resetSession();
    expect(detector.durationWindow).toEqual({ minMs: LEGACY_MIN_BLINK_MS, maxMs: LEGACY_MAX_BLINK_MS });
    expect(replayRows(parseFrameCsv(syntheticFullBlink())).count).toBe(golden.fullBlink);
    expect(replayRows(parseFrameCsv(syntheticTwoFullBlinks())).count).toBe(golden.twoFullBlinks);
  });

  it("can tighten duration after calibration without changing default replay", () => {
    const tight = replayRows(parseFrameCsv(syntheticFullBlink()), (detector) => {
      detector.setDurationWindow(50, 80);
    });
    expect(tight.count).toBe(0);
    expect(replayRows(parseFrameCsv(syntheticFullBlink())).count).toBe(golden.fullBlink);
  });

  it("resetSession restores the legacy window", () => {
    const detector = new BlinkDetector();
    detector.setDurationWindow(90, 320);
    expect(detector.durationWindow).toEqual({ minMs: 90, maxMs: 320 });
    detector.resetSession();
    expect(detector.durationWindow).toEqual({ minMs: LEGACY_MIN_BLINK_MS, maxMs: LEGACY_MAX_BLINK_MS });
  });
});
