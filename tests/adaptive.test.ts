import { describe, expect, it } from "vitest";
import { BlinkDetector } from "../src/blinkDetector";
import { AdaptiveCalibration } from "../src/calibration";
import { CLOSE_FRAC_LEGACY, OPEN_FRAC_LEGACY, computeAdaptiveLines } from "../src/adaptive";
import { parseFrameCsv, replayRows } from "../src/replay";
import { DEFAULT_SETTINGS } from "../src/settings";
import {
  PERSONA_BIG,
  PERSONA_NOISY,
  PERSONA_SHALLOW,
  PERSONA_SMALL,
  syntheticFullBlink,
  syntheticHeadTilt,
  syntheticJitterOnly,
  syntheticOneEyeOnly,
  syntheticPartialDip,
  syntheticPersona,
  syntheticTwoFullBlinks,
} from "./fixtures/generate";
import golden from "./golden.json";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const realDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "real");

function replayAdaptive(csv: string, calUntil: number, testUntil: number, nCal: 5 | 10 = 10) {
  const detector = new BlinkDetector();
  detector.resetSession();
  const cal = new AdaptiveCalibration(nCal);
  const rows = parseFrameCsv(csv);
  let calCounts = 0;
  let testCounts = 0;
  let jitterCounts = 0;
  for (const row of rows) {
    const before = detector.blinkCount;
    if (!row.faceValid || !row.poseValid) {
      detector.observe(row.left, row.right);
      detector.lostFace();
    } else {
      const snap = detector.update(row.left, row.right, row.t, false, true);
      if (snap.justBlinked && snap.event) {
        cal.consider(snap.event, detector.earHistory, snap.event.baseline * OPEN_FRAC_LEGACY);
        if (cal.complete) detector.setAdaptiveClosedRatio(cal.r);
      }
    }
    if (detector.blinkCount > before) {
      if (row.t <= calUntil) calCounts += 1;
      else if (row.t <= testUntil) testCounts += 1;
      else jitterCounts += 1;
    }
  }
  const legacy = replayRows(parseFrameCsv(csv)).count;
  return { adaptive: detector.blinkCount, calCounts, testCounts, jitterCounts, legacy, cal };
}

describe("adaptiveThreshold flag defaults", () => {
  it("is OFF and leaves golden + real fixtures unchanged", () => {
    expect(DEFAULT_SETTINGS.adaptiveThreshold).toBe(false);
    expect(replayRows(parseFrameCsv(syntheticFullBlink())).count).toBe(golden.fullBlink);
    expect(replayRows(parseFrameCsv(syntheticTwoFullBlinks())).count).toBe(golden.twoFullBlinks);
    expect(replayRows(parseFrameCsv(syntheticPartialDip())).count).toBe(golden.partialDip);
    expect(replayRows(parseFrameCsv(syntheticJitterOnly())).count).toBe(golden.jitterOnly);
    expect(replayRows(parseFrameCsv(syntheticOneEyeOnly())).count).toBe(golden.oneEyeOnly);
    expect(replayRows(parseFrameCsv(syntheticHeadTilt())).count).toBe(golden.headTilt);
    const files = readdirSync(realDir).filter((name) => name.toLowerCase().endsWith(".csv"));
    for (const file of files) {
      const csv = readFileSync(join(realDir, file), "utf8");
      expect(replayRows(parseFrameCsv(csv)).count).toBe((golden.real as Record<string, number>)[file]);
    }
  });

  it("matches OFF when ON with r forced to 0.23", () => {
    const on = (csv: string) =>
      replayRows(parseFrameCsv(csv), (detector) => detector.setAdaptiveClosedRatio(0.23)).count;
    const off = (csv: string) => replayRows(parseFrameCsv(csv)).count;
    expect(on(syntheticFullBlink())).toBe(off(syntheticFullBlink()));
    expect(on(syntheticTwoFullBlinks())).toBe(off(syntheticTwoFullBlinks()));
    expect(on(syntheticPartialDip())).toBe(off(syntheticPartialDip()));
    expect(on(syntheticJitterOnly())).toBe(off(syntheticJitterOnly()));
    expect(on(syntheticFullBlink())).toBe(golden.fullBlink);
  });
});

describe("adaptive lines", () => {
  it("reproduces legacy fractions at r = 0.23", () => {
    const B = 0.31;
    const lines = computeAdaptiveLines(B, 0.23, 0);
    expect(lines.close).toBeCloseTo(B * CLOSE_FRAC_LEGACY, 10);
    expect(lines.open).toBeCloseTo(B * OPEN_FRAC_LEGACY, 10);
    expect(lines.noisy).toBe(false);
  });
});

describe("synthetic personas", () => {
  const personas = [
    { name: "big eyes", spec: PERSONA_BIG },
    { name: "small eyes", spec: PERSONA_SMALL },
    { name: "shallow-floor camera", spec: PERSONA_SHALLOW },
    { name: "noisy", spec: PERSONA_NOISY },
  ];

  for (const persona of personas) {
    it(`${persona.name}: 20 test blinks and 0 jitter false positives`, () => {
      const fixture = syntheticPersona({ ...persona.spec, nCal: 10, nTest: 20, jitterMs: 30_000 });
      const result = replayAdaptive(fixture.csv, fixture.calUntil, fixture.testUntil, 10);
      // eslint-disable-next-line no-console
      console.log(
        `${persona.name}: adaptive test=${result.testCounts} jitter=${result.jitterCounts} total=${result.adaptive}; legacy total=${result.legacy}`,
      );
      expect(result.testCounts).toBe(20);
      expect(result.jitterCounts).toBe(0);
    });
  }
});
