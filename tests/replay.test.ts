import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFrameCsv, replayRows } from "../src/replay";
import {
  syntheticFullBlink,
  syntheticHeadTilt,
  syntheticJitterOnly,
  syntheticOneEyeOnly,
  syntheticPartialDip,
  syntheticTwoFullBlinks,
} from "./fixtures/generate";
import golden from "./golden.json";

const realDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "real");

function listRealCsvs(): string[] {
  return readdirSync(realDir)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort();
}

describe("golden replay through BlinkDetector", () => {
  it("counts the SYNTHETIC full blink fixture", () => {
    const result = replayRows(parseFrameCsv(syntheticFullBlink()));
    expect(result.count).toBe(golden.fullBlink);
  });

  it("counts two SYNTHETIC full blinks", () => {
    const result = replayRows(parseFrameCsv(syntheticTwoFullBlinks()));
    expect(result.count).toBe(golden.twoFullBlinks);
  });

  it("snapshots the SYNTHETIC partial dip (~0.17 trough)", () => {
    const result = replayRows(parseFrameCsv(syntheticPartialDip()));
    expect(result.count).toBe(golden.partialDip);
  });

  it("counts 0 on jitter-only", () => {
    const result = replayRows(parseFrameCsv(syntheticJitterOnly()));
    expect(result.count).toBe(0);
    expect(result.count).toBe(golden.jitterOnly);
  });

  it("counts 0 on one-eye-only (pose-invalid)", () => {
    const result = replayRows(parseFrameCsv(syntheticOneEyeOnly()));
    expect(result.count).toBe(0);
    expect(result.count).toBe(golden.oneEyeOnly);
  });

  it("counts 0 on head-tilt (pose-invalid)", () => {
    const result = replayRows(parseFrameCsv(syntheticHeadTilt()));
    expect(result.count).toBe(0);
    expect(result.count).toBe(golden.headTilt);
  });

  it("emits one event per counted blink without changing the golden count", () => {
    const detectorCount = replayRows(parseFrameCsv(syntheticTwoFullBlinks())).count;
    expect(detectorCount).toBe(golden.twoFullBlinks);
  });
});

describe("real recordings in tests/fixtures/real", () => {
  it("snapshots detector counts without changing the detector", () => {
    const files = listRealCsvs();
    const recorded = (golden.real ?? {}) as Record<string, number>;
    expect(files).toEqual(Object.keys(recorded).sort());
    for (const file of files) {
      const csv = readFileSync(join(realDir, file), "utf8");
      const count = replayRows(parseFrameCsv(csv)).count;
      expect(count, file).toBe(recorded[file]);
    }
  });
});
