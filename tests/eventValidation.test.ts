import { describe, expect, it } from "vitest";
import {
  durationRejectReason,
  formatRejectionSummary,
  emptyRejectionCounts,
  winkRejects,
} from "../src/eventValidation";

describe("durationRejectReason", () => {
  it("uses inclusive strict 60–500 bounds", () => {
    expect(durationRejectReason(59.9, 60, 500)).toBe("tooShort");
    expect(durationRejectReason(60, 60, 500)).toBeNull();
    expect(durationRejectReason(500, 60, 500)).toBeNull();
    expect(durationRejectReason(500.1, 60, 500)).toBe("tooLong");
  });

  it("keeps the legacy 50–700 window", () => {
    expect(durationRejectReason(50, 50, 700)).toBeNull();
    expect(durationRejectReason(700, 50, 700)).toBeNull();
    expect(durationRejectReason(49, 50, 700)).toBe("tooShort");
    expect(durationRejectReason(701, 50, 700)).toBe("tooLong");
  });
});

describe("winkRejects", () => {
  it("requires both n <= 0.80 and |nL-nR| <= 0.35", () => {
    expect(winkRejects(0.07 / 0.31, 0.12 / 0.31, 0.8, 0.35)).toBe(false);
    expect(winkRejects(0.07 / 0.31, 0.31 / 0.31, 0.8, 0.35)).toBe(true);
    expect(winkRejects(0.1 / 0.31, 0.22 / 0.31, 0.8, 0.35)).toBe(true);
    expect(winkRejects(0.8, 0.8, 0.8, 0.35)).toBe(false);
    expect(winkRejects(0.801, 0.5, 0.8, 0.35)).toBe(true);
  });
});

describe("formatRejectionSummary", () => {
  it("lists every reason", () => {
    const counts = emptyRejectionCounts();
    counts.tooLong = 2;
    expect(formatRejectionSummary(counts)).toBe(
      "2 · tooShort 0 · tooLong 2 · wink 0 · faceLost 0 · poseInvalid 0 · gap 0",
    );
  });
});
