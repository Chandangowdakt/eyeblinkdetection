import { describe, expect, it } from "vitest";
import { BlinkDetector } from "../src/blinkDetector";
import { parseFrameCsv, replayRows } from "../src/replay";
import {
  syntheticFullBlink,
  syntheticFullBlinkAfterHold,
  syntheticFullBlinkAt,
  syntheticHeadTilt,
  syntheticJitterOnly,
  syntheticOneEyeOnly,
  syntheticPartialDip,
  syntheticTwoFullBlinks,
  withTimestampJitter,
} from "./fixtures/generate";
import golden from "./golden.json";
import { FRAME_INTERVAL_30_MS, VALLEY_FRAMES, VALLEY_MS, WARMUP_FRAMES, WARMUP_MS, framesFromMs } from "../src/timing";

const DT30 = 1000 / 30;
const DT60 = 1000 / 60;

function feed(csv: string): BlinkDetector {
  const detector = new BlinkDetector();
  detector.resetSession();
  for (const row of parseFrameCsv(csv)) {
    if (!row.faceValid || !row.poseValid) {
      detector.observe(row.left, row.right);
      detector.lostFace();
    } else {
      detector.update(row.left, row.right, row.t, false, true);
    }
  }
  return detector;
}

describe("millisecond-derived frame windows", () => {
  it("matches the live 13 / 16 frame constants at 33.3 ms", () => {
    expect(FRAME_INTERVAL_30_MS).toBeCloseTo(DT30, 8);
    expect(framesFromMs(VALLEY_MS, FRAME_INTERVAL_30_MS)).toBe(VALLEY_FRAMES);
    expect(framesFromMs(WARMUP_MS, FRAME_INTERVAL_30_MS)).toBe(WARMUP_FRAMES);
    expect(framesFromMs(VALLEY_MS, DT30)).toBe(13);
    expect(framesFromMs(WARMUP_MS, DT30)).toBe(16);
  });

  it("golden counts are identical at 33.3 ms steps", () => {
    expect(replayRows(parseFrameCsv(syntheticFullBlink())).count).toBe(golden.fullBlink);
    expect(replayRows(parseFrameCsv(syntheticTwoFullBlinks())).count).toBe(golden.twoFullBlinks);
    const detector = feed(syntheticFullBlink());
    expect(detector.timingWindows.valleyFrames).toBe(13);
    expect(detector.timingWindows.warmupFrames).toBe(16);
    expect(detector.blinkCount).toBe(golden.fullBlink);
  });

  it("keeps 13/16 frames until 16.7 ms persists more than 2 s", () => {
    expect(framesFromMs(VALLEY_MS, DT60)).toBe(26);
    expect(framesFromMs(WARMUP_MS, DT60)).toBe(32);
    const short = feed(syntheticFullBlinkAt(DT60));
    expect(short.timingWindows.valleyFrames).toBe(13);
    expect(short.timingWindows.warmupFrames).toBe(16);
    const held = feed(syntheticFullBlinkAfterHold(DT60, 2500));
    expect(held.timingWindows.valleyFrames).toBe(26);
    expect(held.timingWindows.warmupFrames).toBe(32);
    expect(held.blinkCount).toBe(golden.fullBlink);
  });

  it("33 +/- 4 ms timestamp jitter matches golden counts", () => {
    expect(replayRows(parseFrameCsv(withTimestampJitter(syntheticFullBlink()))).count).toBe(golden.fullBlink);
    expect(replayRows(parseFrameCsv(withTimestampJitter(syntheticTwoFullBlinks()))).count).toBe(golden.twoFullBlinks);
    expect(replayRows(parseFrameCsv(withTimestampJitter(syntheticPartialDip()))).count).toBe(golden.partialDip);
    expect(replayRows(parseFrameCsv(withTimestampJitter(syntheticJitterOnly()))).count).toBe(golden.jitterOnly);
    expect(replayRows(parseFrameCsv(withTimestampJitter(syntheticOneEyeOnly()))).count).toBe(golden.oneEyeOnly);
    expect(replayRows(parseFrameCsv(withTimestampJitter(syntheticHeadTilt()))).count).toBe(golden.headTilt);
    const detector = feed(withTimestampJitter(syntheticFullBlink()));
    expect(detector.timingWindows.valleyFrames).toBe(13);
    expect(detector.timingWindows.warmupFrames).toBe(16);
  });
});

