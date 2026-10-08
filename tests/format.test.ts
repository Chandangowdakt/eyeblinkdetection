import { describe, expect, it } from "vitest";
import { LEGACY_MAX_BLINK_MS, LEGACY_MIN_BLINK_MS, STRICT_MAX_MS, STRICT_MIN_MS } from "../src/eventValidation";
import {
  countingFooterText,
  formatBlinkLogRow,
  formatClosedFloor,
  formatHeroRateValue,
  formatPartialHeadline,
  formatPartialSession,
  formatPartialWindow,
  formatRejectedCount,
  formatSessionAverage,
  formatSubjectTiming,
} from "../src/format";
import { VALLEY_MS } from "../src/timing";

describe("partial % formatters", () => {
  it("shows a large-text percentage and gates with —", () => {
    expect(formatPartialHeadline(null)).toBe("—");
    expect(formatPartialHeadline(Number.NaN)).toBe("—");
    expect(formatPartialHeadline(6.25)).toBe("6%");
    expect(formatPartialHeadline(0)).toBe("0%");
  });

  it("formats the 60 s line and session line", () => {
    expect(formatPartialWindow(1, 16, 0)).toBe("1 of 16 in last 60 s (+0 unsure)");
    expect(formatPartialWindow(1, 2, 1)).toBe("1 of 2 in last 60 s (+1 unsure)");
    expect(formatPartialWindow(0, 0, 0)).toBe("—");
    expect(formatPartialSession(5, 24)).toBe("Session 21% (5 of 24)");
    expect(formatPartialSession(0, 0)).toBe("Session —");
  });
});

describe("blink log formatter", () => {
  it("shows #n class · duration ms · closure · drop", () => {
    expect(formatBlinkLogRow(3, "full", 180, 0.82, 0.77)).toBe(
      "#3 full · 180 ms · closure 82% · drop 77%",
    );
    expect(formatBlinkLogRow(1, "partial", 120.4, 0.4, 0.355)).toBe(
      "#1 partial · 120 ms · closure 40% · drop 36%",
    );
  });
});

describe("hero rate formatter", () => {
  it("formats 0.0, 7.0, 20.0, 100.0 without overflow copy", () => {
    for (const value of [0, 7, 20, 100]) {
      const text = formatHeroRateValue(value);
      expect(text).toBe(value.toFixed(1));
      expect(text).not.toContain("(60s)");
      expect(text.length).toBeLessThanOrEqual(5);
    }
    expect(formatHeroRateValue(null)).toBe("—");
    expect(formatSessionAverage(12.34)).toBe("session average, 12.3 blinks / min");
  });
});

describe("rejected count and footer", () => {
  it("formats rejected count once and footer from exported constants", () => {
    expect(formatRejectedCount(0)).toBe("Rejected events: 0");
    expect(formatRejectedCount(7)).toBe("Rejected events: 7");
    expect(
      countingFooterText(VALLEY_MS, LEGACY_MIN_BLINK_MS, LEGACY_MAX_BLINK_MS, STRICT_MIN_MS, STRICT_MAX_MS),
    ).toBe(
      "Counting uses an eye-closure dip and recovery check (about 0.4 s window), a both-eyes check, and a blink length of 50-700 ms (60-500 ms with strict validation on).",
    );
  });
});

describe("closed-floor formatter", () => {
  it("shows calibrating and calibrated copy", () => {
    expect(
      formatClosedFloor({ complete: false, count: 4, target: 10, r: 0.23, baseline: 0.31 }),
    ).toBe("Calibrating 4/10, blink fully");
    expect(
      formatClosedFloor({
        complete: true,
        count: 10,
        target: 10,
        r: 0.23,
        baseline: 0.07 / 0.23,
      }),
    ).toBe("Floor 0.07 (23% of baseline), 10/10 blinks");
  });

  it("formats the personal blink-timing line after calibration", () => {
    expect(formatSubjectTiming(null)).toBe("");
    expect(
      formatSubjectTiming({ medianMs: 180.4, minMs: 90, maxMs: 350, fullClosure: 0.72 }),
    ).toBe("Typical blink 180 ms (90–350 ms), full ≥ 72%");
  });
});
