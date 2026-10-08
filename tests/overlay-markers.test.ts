import { describe, expect, it } from "vitest";
import { CHART_HISTORY, chartMarkerIndex, chartMarkerShape, chartSampleX } from "../src/overlay";

describe("chart blink markers", () => {
  it("maps full to a triangle and partial to a diamond", () => {
    expect(chartMarkerShape("full")).toBe("triangle");
    expect(chartMarkerShape("partial")).toBe("diamond");
  });

  it("keeps counted-blink marker indexes on the chart", () => {
    expect(chartMarkerIndex(0, 10)).toBe(9);
    expect(chartMarkerIndex(9, 10)).toBe(0);
    expect(chartMarkerIndex(10, 10)).toBeNull();
    const xNow = chartSampleX(9, 10, CHART_HISTORY, 300);
    const xOld = chartSampleX(0, 10, CHART_HISTORY, 300);
    expect(xNow).toBeGreaterThan(xOld);
    expect(xNow).toBeLessThanOrEqual(300);
  });
});
