import { describe, expect, it } from "vitest";
import {
  PARTIAL_SCALE,
  RESTING_RATE_BOUNDS,
  markerPlacement,
  rateSegmentEdges,
  scaleLevel,
  scaleLevelWithHysteresis,
  scaleView,
  type Scale,
  type ScaleResult,
} from "../src/scales";

const resting = { kind: "rate" as const, bounds: RESTING_RATE_BOUNDS };

describe("partial % scale (strict above)", () => {
  it("treats 0 as ideal green and uses inclusive 25 / 50 / 75 bounds", () => {
    expect(scaleLevel(0, PARTIAL_SCALE)).toMatchObject({ level: "green", label: "Normal" });
    expect(scaleLevel(25, PARTIAL_SCALE)).toMatchObject({ level: "green", label: "Normal" });
    expect(scaleLevel(25.001, PARTIAL_SCALE)).toMatchObject({ level: "blue", side: "high", label: "Above" });
    expect(scaleLevel(50, PARTIAL_SCALE)).toMatchObject({ level: "blue", side: "high", label: "Above" });
    expect(scaleLevel(50.001, PARTIAL_SCALE)).toMatchObject({ level: "orange", side: "high", label: "High" });
    expect(scaleLevel(75, PARTIAL_SCALE)).toMatchObject({ level: "orange", side: "high", label: "High" });
    expect(scaleLevel(75.001, PARTIAL_SCALE)).toMatchObject({ level: "red", side: "high", label: "Very high" });
  });
});

describe("resting blink-rate scale", () => {
  it("matches every resting threshold 5 / 8 / 12 / 20 / 25 / 30", () => {
    expect(scaleLevel(4.999, resting)).toMatchObject({ level: "red", side: "low", label: "Very low" });
    expect(scaleLevel(5, resting)).toMatchObject({ level: "orange", side: "low", label: "Low" });
    expect(scaleLevel(7.999, resting)).toMatchObject({ level: "orange", side: "low", label: "Low" });
    expect(scaleLevel(8, resting)).toMatchObject({ level: "blue", side: "low", label: "Below" });
    expect(scaleLevel(11.999, resting)).toMatchObject({ level: "blue", side: "low", label: "Below" });
    expect(scaleLevel(12, resting)).toMatchObject({ level: "green", label: "Normal" });
    expect(scaleLevel(20, resting)).toMatchObject({ level: "green", label: "Normal" });
    expect(scaleLevel(20.001, resting)).toMatchObject({ level: "blue", side: "high", label: "Above" });
    expect(scaleLevel(25, resting)).toMatchObject({ level: "blue", side: "high", label: "Above" });
    expect(scaleLevel(25.001, resting)).toMatchObject({ level: "orange", side: "high", label: "High" });
    expect(scaleLevel(30, resting)).toMatchObject({ level: "orange", side: "high", label: "High" });
    expect(scaleLevel(30.001, resting)).toMatchObject({ level: "red", side: "high", label: "Very high" });
  });
});

describe("hysteresis", () => {
  it("needs 0.5 units past a boundary before the level changes", () => {
    const green = scaleLevel(16, resting);
    expect(green.level).toBe("green");
    expect(scaleLevelWithHysteresis(11.6, resting, green).level).toBe("green");
    expect(scaleLevelWithHysteresis(11.5, resting, green).level).toBe("green");
    expect(scaleLevelWithHysteresis(11.49, resting, green)).toMatchObject({ level: "blue", side: "low" });
    expect(scaleLevelWithHysteresis(20.5, resting, green).level).toBe("green");
    expect(scaleLevelWithHysteresis(20.51, resting, green)).toMatchObject({ level: "blue", side: "high" });
    const blueHigh = scaleLevel(22, resting);
    expect(scaleLevelWithHysteresis(20.4, resting, blueHigh).level).toBe("blue");
    expect(scaleLevelWithHysteresis(19.5, resting, blueHigh).level).toBe("blue");
    expect(scaleLevelWithHysteresis(19.49, resting, blueHigh).level).toBe("green");
    const partialGreen = scaleLevel(20, PARTIAL_SCALE);
    expect(scaleLevelWithHysteresis(25.4, PARTIAL_SCALE, partialGreen).level).toBe("green");
    expect(scaleLevelWithHysteresis(25.5, PARTIAL_SCALE, partialGreen).level).toBe("green");
    expect(scaleLevelWithHysteresis(25.51, PARTIAL_SCALE, partialGreen).level).toBe("blue");
  });
});

describe("insufficient data", () => {
  it("returns grey with no level when data are insufficient", () => {
    const missing = scaleView(18, resting, false, null);
    expect(missing.view).toEqual({ level: "grey", label: "" });
    expect(missing.stored).toBeNull();
    const noValue = scaleView(null, PARTIAL_SCALE, true, null);
    expect(noValue.view.level).toBe("grey");
    const ok = scaleView(18, resting, true, null);
    expect(ok.view.level).toBe("green");
    expect(ok.view.label).toBe("Normal");
  });
});

function colourIndexFromLevel(result: ScaleResult, kind: Scale["kind"]): number {
  if (kind === "partial") {
    if (result.level === "green") return 0;
    if (result.level === "blue") return 1;
    if (result.level === "orange") return 2;
    return 3;
  }
  if (result.level === "red" && result.side === "low") return 0;
  if (result.level === "orange" && result.side === "low") return 1;
  if (result.level === "blue" && result.side === "low") return 2;
  if (result.level === "green") return 3;
  if (result.level === "blue" && result.side === "high") return 4;
  if (result.level === "orange" && result.side === "high") return 5;
  return 6;
}

describe("segment marker placement", () => {
  it("uses resting display ranges [0,5] … [30,40]", () => {
    expect(rateSegmentEdges(RESTING_RATE_BOUNDS)).toEqual([0, 5, 8, 12, 20, 25, 30, 40]);
  });

  it("puts the marker in the same segment as scaleLevel colour at every boundary, ±1, and 9/13/16", () => {
    const rateValues = [5, 8, 12, 20, 25, 30].flatMap((b) => [b - 1, b, b + 1]).concat([9, 13, 16]);
    for (const value of rateValues) {
      const expected = colourIndexFromLevel(scaleLevel(value, resting), "rate");
      expect(markerPlacement(value, resting).segmentIndex, `rate ${value}`).toBe(expected);
    }
    const partialValues = [25, 50, 75].flatMap((b) => [b - 1, b, b + 1]);
    for (const value of partialValues) {
      const expected = colourIndexFromLevel(scaleLevel(value, PARTIAL_SCALE), "partial");
      expect(markerPlacement(value, PARTIAL_SCALE).segmentIndex, `partial ${value}`).toBe(expected);
    }
  });

  it("clamps values outside the bar to the edges", () => {
    expect(markerPlacement(-3, resting).ratio).toBe(0);
    expect(markerPlacement(40, resting).ratio).toBe(1);
    expect(markerPlacement(80, resting).ratio).toBe(1);
    expect(markerPlacement(-10, PARTIAL_SCALE).ratio).toBe(0);
    expect(markerPlacement(100, PARTIAL_SCALE).ratio).toBe(1);
    expect(markerPlacement(140, PARTIAL_SCALE).ratio).toBe(1);
  });
});
