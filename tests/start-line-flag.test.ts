import { describe, expect, it } from "vitest";
import { BlinkDetector } from "../src/blinkDetector";
import { parseFrameCsv, replayRows } from "../src/replay";
import { DEFAULT_SETTINGS } from "../src/settings";
import { syntheticFullBlink, syntheticTwoFullBlinks } from "./fixtures/generate";
import golden from "./golden.json";

describe("useCustomStartLine flag", () => {
  it("defaults OFF and keeps the original close line / golden counts", () => {
    expect(DEFAULT_SETTINGS.useCustomStartLine).toBe(false);
    expect(replayRows(parseFrameCsv(syntheticFullBlink())).count).toBe(golden.fullBlink);
    expect(replayRows(parseFrameCsv(syntheticTwoFullBlinks())).count).toBe(golden.twoFullBlinks);
  });

  it("matches golden when the flag is ON at the original 70% start line", () => {
    const detector = new BlinkDetector();
    detector.resetSession();
    detector.setCustomStartLine(0.7);
    for (const row of parseFrameCsv(syntheticFullBlink())) {
      detector.update(row.left, row.right, row.t, false, true);
    }
    expect(detector.blinkCount).toBe(golden.fullBlink);
  });

  it("uses the original constant when the flag is cleared", () => {
    const detector = new BlinkDetector();
    detector.setCustomStartLine(0.55);
    detector.setCustomStartLine(null);
    detector.resetSession();
    for (const row of parseFrameCsv(syntheticFullBlink())) {
      detector.update(row.left, row.right, row.t, false, true);
    }
    expect(detector.blinkCount).toBe(golden.fullBlink);
  });
});
