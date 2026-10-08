import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");

const REQUIRED_IDS = [
  "webcam",
  "overlay",
  "scrim",
  "scrim-copy",
  "coach",
  "stage",
  "engine-pill",
  "fps-pill",
  "control-bar",
  "start-btn",
  "stop-btn",
  "reset-btn",
  "blink-count",
  "blink-rate",
  "left-ear",
  "right-ear",
  "ear-stats",
  "threshold-value",
  "eye-state",
  "face-state",
  "closed-floor",
  "noisy-chip",
  "rate-paused",
  "rate-60",
  "rate-scale",
  "rate-scale-marker",
  "rate-scale-label",
  "partial-paused",
  "partial-pct",
  "partial-window",
  "partial-session",
  "partial-scale",
  "partial-scale-marker",
  "partial-scale-label",
  "pose-readout",
  "export-blinks-btn",
  "blink-log",
  "openness-toggle",
  "ear-chart",
  "export-frames-btn",
  "recalibrate-btn",
  "recalibrate-banner",
  "partial-candidate-wrap",
  "partial-candidates",
  "rejected-wrap",
  "rejected-count",
  "rejected-reasons",
  "rejected-log",
  "settings-panel",
  "opt-adaptive",
  "opt-cal-blinks",
  "opt-partial",
  "opt-recovery",
  "opt-pitch",
  "opt-strict-events",
  "opt-strict-min",
  "opt-strict-max",
  "opt-wink-dip",
  "opt-wink-asym",
  "opt-custom-start",
  "opt-start",
  "opt-full",
  "opt-pose-limit",
  "opt-fps",
  "opt-rate-preset",
  "opt-rate-verylow",
  "opt-rate-low",
  "opt-rate-below",
  "opt-rate-greenmax",
  "opt-rate-above",
  "opt-rate-high",
  "reset-settings-btn",
  "scale-footnote",
  "hint",
  "settings-dialog",
];

describe("index.html structure", () => {
  it("has semantic landmarks, settings dialog, and lang", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<header\b/);
    expect(html).toMatch(/<main\b/);
    expect(html).toMatch(/<footer\b/);
    expect(html).toContain('id="settings-dialog"');
    expect(html).toContain('aria-live="polite"');
  });

  it("keeps every previous id exactly once", () => {
    for (const id of REQUIRED_IDS) {
      const matches = html.match(new RegExp(`\\sid="${id}"`, "g")) ?? [];
      expect(matches, id).toHaveLength(1);
    }
  });

  it("exposes meter aria on both scale bars", () => {
    expect(html).toMatch(/id="rate-scale"[^>]*role="meter"/);
    expect(html).toMatch(/id="partial-scale"[^>]*role="meter"/);
    expect(html).toMatch(/id="rate-scale"[^>]*aria-valuemin="0"/);
    expect(html).toMatch(/id="rate-scale"[^>]*aria-valuemax="40"/);
    expect(html).toMatch(/id="rate-scale"[^>]*aria-valuenow="0"/);
    expect(html).toMatch(/id="rate-scale"[^>]*aria-valuetext="No reading"/);
    expect(html).toMatch(/id="partial-scale"[^>]*aria-valuemin="0"/);
    expect(html).toMatch(/id="partial-scale"[^>]*aria-valuemax="100"/);
    expect(html).toMatch(/id="partial-scale"[^>]*aria-valuenow="0"/);
    expect(html).toMatch(/id="partial-scale"[^>]*aria-valuetext="No reading"/);
  });
});
