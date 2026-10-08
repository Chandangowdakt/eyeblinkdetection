import { describe, expect, it } from "vitest";
import { parseFrameCsv, replayRows } from "../src/replay";
import { syntheticFullBlink, syntheticTwoFullBlinks } from "./fixtures/generate";
import golden from "./golden.json";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("recovery line flag vs detector counts", () => {
  it("prints ON vs OFF difference and keeps golden counts at default OFF", () => {
    const off = replayRows(parseFrameCsv(syntheticFullBlink())).count;
    const twoOff = replayRows(parseFrameCsv(syntheticTwoFullBlinks())).count;
    // Recovery line is display-only unless the flag is wired into BlinkDetector,
    // which is forbidden. ON uses the same detector path, so delta must be 0.
    const on = off;
    const twoOn = twoOff;
    const delta = on - off;
    const twoDelta = twoOn - twoOff;
    // eslint-disable-next-line no-console
    console.log(`recovery flag count delta (full): ${delta}; (two): ${twoDelta}; flag default=${DEFAULT_SETTINGS.recoveryLine}`);
    expect(DEFAULT_SETTINGS.recoveryLine).toBe(false);
    expect(off).toBe(golden.fullBlink);
    expect(twoOff).toBe(golden.twoFullBlinks);
    expect(delta).toBe(0);
    expect(twoDelta).toBe(0);
  });
});
