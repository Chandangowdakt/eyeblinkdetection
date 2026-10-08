import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BlinkDetector } from "../src/blinkDetector";
import { DEFAULT_STRICT_CONFIG } from "../src/eventValidation";
import { parseFrameCsv, replayRows } from "../src/replay";
import { DEFAULT_SETTINGS } from "../src/settings";
import {
  syntheticFaceLostMidBlink,
  syntheticFullBlink,
  syntheticGapMidBlink,
  syntheticHeadTilt,
  syntheticHeadTurnAsymmetry,
  syntheticHeldClosed,
  syntheticJitterOnly,
  syntheticMildAsymmetry,
  syntheticOneEyeOnly,
  syntheticOneFrameSpike,
  syntheticPartialDip,
  syntheticPoseInvalidMidBlink,
  syntheticTwoFullBlinks,
  syntheticWink,
} from "./fixtures/generate";
import golden from "./golden.json";

const realDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "real");

function enableStrict(detector: BlinkDetector): void {
  detector.setStrictValidation({ ...DEFAULT_STRICT_CONFIG, enabled: true });
}

function replayStrict(csv: string) {
  return replayRows(parseFrameCsv(csv), enableStrict);
}

function replayLegacy(csv: string) {
  return replayRows(parseFrameCsv(csv));
}

describe("strictEventValidation flag default", () => {
  it("is OFF", () => {
    expect(DEFAULT_SETTINGS.strictEventValidation).toBe(false);
    expect(DEFAULT_STRICT_CONFIG.enabled).toBe(false);
  });
});

describe("strict vs legacy synthetic events", () => {
  it("wink: one eye 0.07 the other 0.31, strict = 0", () => {
    const csv = syntheticWink();
    const legacy = replayLegacy(csv);
    console.log("wink legacy count", legacy.count, legacy.rejections);
    expect(replayStrict(csv).count).toBe(0);
  });

  it("mild asymmetry: troughs 0.07 and 0.12, strict counts it", () => {
    expect(replayStrict(syntheticMildAsymmetry()).count).toBeGreaterThanOrEqual(1);
  });

  it("head-turn asymmetry: both eyes dip to about 0.8 of baseline unevenly, strict 0", () => {
    const strict = replayStrict(syntheticHeadTurnAsymmetry());
    expect(strict.count).toBe(0);
  });

  it("1-frame spike: legacy 0, strict 0", () => {
    const csv = syntheticOneFrameSpike();
    expect(replayLegacy(csv).count).toBe(0);
    expect(replayStrict(csv).count).toBe(0);
  });

  it("600 ms closure: print legacy; strict rejects tooLong", () => {
    const csv = syntheticHeldClosed(600);
    const legacy = replayLegacy(csv);
    const strict = replayStrict(csv);
    console.log("600 ms legacy count", legacy.count, "strict", strict.count, strict.rejections);
    expect(strict.count).toBe(0);
    expect(strict.rejections.tooLong).toBeGreaterThan(0);
  });

  it("800 ms closure: both reject", () => {
    const csv = syntheticHeldClosed(800);
    expect(replayLegacy(csv).count).toBe(0);
    const strict = replayStrict(csv);
    expect(strict.count).toBe(0);
    expect(strict.rejections.tooLong).toBeGreaterThan(0);
  });

  it("face lost for 5 frames mid-blink: strict 0, faceLost increments", () => {
    const strict = replayStrict(syntheticFaceLostMidBlink());
    expect(strict.count).toBe(0);
    expect(strict.rejections.faceLost).toBeGreaterThan(0);
  });

  it("pose invalid mid-blink: strict 0, poseInvalid increments", () => {
    const strict = replayStrict(syntheticPoseInvalidMidBlink());
    expect(strict.count).toBe(0);
    expect(strict.rejections.poseInvalid).toBeGreaterThan(0);
  });

  it("150 ms timestamp gap mid-blink: strict 0, gap increments", () => {
    const gap = replayStrict(syntheticGapMidBlink(150));
    expect(gap.count).toBe(0);
    expect(gap.rejections.gap).toBeGreaterThan(0);
  });

  it("golden fixtures with the flag ON stay 1/2/1/0/0/0", () => {
    expect(replayStrict(syntheticFullBlink()).count).toBe(golden.fullBlink);
    expect(replayStrict(syntheticTwoFullBlinks()).count).toBe(golden.twoFullBlinks);
    expect(replayStrict(syntheticPartialDip()).count).toBe(golden.partialDip);
    expect(replayStrict(syntheticJitterOnly()).count).toBe(golden.jitterOnly);
    expect(replayStrict(syntheticOneEyeOnly()).count).toBe(golden.oneEyeOnly);
    expect(replayStrict(syntheticHeadTilt()).count).toBe(golden.headTilt);
  });

  it("legacy replay of golden fixtures is unchanged with the flag OFF", () => {
    expect(replayLegacy(syntheticFullBlink()).count).toBe(golden.fullBlink);
    expect(replayLegacy(syntheticTwoFullBlinks()).count).toBe(golden.twoFullBlinks);
    expect(replayLegacy(syntheticPartialDip()).count).toBe(golden.partialDip);
    expect(replayLegacy(syntheticJitterOnly()).count).toBe(golden.jitterOnly);
    expect(replayLegacy(syntheticOneEyeOnly()).count).toBe(golden.oneEyeOnly);
    expect(replayLegacy(syntheticHeadTilt()).count).toBe(golden.headTilt);
  });
});

describe("strict pose abort inside update (moving mid-event)", () => {
  it("does not start the refractory timer when discarding", () => {
    const detector = new BlinkDetector();
    enableStrict(detector);
    const rows = parseFrameCsv(syntheticFullBlink());
    let holdMoving = false;
    for (const row of rows) {
      if (!row.faceValid || !row.poseValid) {
        detector.noteInvalidFrame("faceLost", row.t);
        continue;
      }
      if (detector.closed) holdMoving = true;
      detector.update(row.left, row.right, row.t, holdMoving, true);
    }
    expect(detector.blinkCount).toBe(0);
    expect(detector.rejections.poseInvalid).toBeGreaterThan(0);
  });
});

describe("real recordings ON vs OFF (print only)", () => {
  it("prints counts and rejection reasons without asserting", () => {
    const files = readdirSync(realDir).filter((name) => name.toLowerCase().endsWith(".csv")).sort();
    for (const file of files) {
      const csv = readFileSync(join(realDir, file), "utf8");
      const off = replayLegacy(csv);
      const on = replayStrict(csv);
      console.log(`real ${file} OFF=${off.count} ON=${on.count} rejections`, on.rejections);
    }
    expect(files.length).toBeGreaterThanOrEqual(0);
  });
});
