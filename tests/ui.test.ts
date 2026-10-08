import { describe, expect, it } from "vitest";
import { RESTING_RATE_BOUNDS } from "../src/scales";
import {
  EMPTY_LOW_FPS,
  blinkClassLabel,
  cameraErrorKind,
  isNearScaleBoundary,
  resolvePanelTab,
  shellStateLabel,
  shortcutAction,
  shouldIgnoreShortcutTarget,
  stepLowFps,
} from "../src/ui";

describe("panel tabs", () => {
  it("keeps a valid tab and ignores unknown ids", () => {
    expect(resolvePanelTab("rejected", "log")).toBe("rejected");
    expect(resolvePanelTab("diagnostics")).toBe("diagnostics");
    expect(resolvePanelTab("nope", "log")).toBe("log");
    expect(resolvePanelTab(null, "rejected")).toBe("rejected");
  });
});

describe("shortcut handler", () => {
  it("toggles start/stop from Space unless focus is in an input or the dialog", () => {
    expect(shouldIgnoreShortcutTarget({ tagName: "INPUT" })).toBe(true);
    expect(shouldIgnoreShortcutTarget({ tagName: "SELECT" })).toBe(true);
    expect(shouldIgnoreShortcutTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(shouldIgnoreShortcutTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(shouldIgnoreShortcutTarget({ tagName: "BUTTON" })).toBe(false);
    expect(shortcutAction({ key: " ", target: { tagName: "BODY" } }, false)).toBe("toggle-run");
    expect(shortcutAction({ key: " ", target: { tagName: "INPUT" } }, false)).toBe(null);
    expect(shortcutAction({ key: " ", target: { tagName: "BODY" } }, true)).toBe(null);
    expect(shortcutAction({ key: "Escape", target: { tagName: "BODY" } }, true)).toBe("close-dialog");
    expect(shortcutAction({ key: "Escape", target: { tagName: "BODY" } }, false)).toBe(null);
    expect(shortcutAction({ key: "a", target: { tagName: "BODY" } }, false)).toBe(null);
  });
});

describe("low fps hysteresis", () => {
  it("turns on after 5 s below 24 and clears after 5 s at 26+", () => {
    let state = EMPTY_LOW_FPS;
    state = stepLowFps(state, 16, 0);
    expect(state.active).toBe(false);
    state = stepLowFps(state, 16, 4999);
    expect(state.active).toBe(false);
    state = stepLowFps(state, 16, 5000);
    expect(state.active).toBe(true);
    state = stepLowFps(state, 26, 6000);
    expect(state.active).toBe(true);
    state = stepLowFps(state, 26, 10999);
    expect(state.active).toBe(true);
    state = stepLowFps(state, 26, 11000);
    expect(state.active).toBe(false);
  });
});

describe("near-boundary tag", () => {
  it("flags values inside the 0.5 hysteresis band without changing scaleLevel", () => {
    const rate = { kind: "rate" as const, bounds: RESTING_RATE_BOUNDS };
    expect(isNearScaleBoundary(12, rate)).toBe(true);
    expect(isNearScaleBoundary(12.5, rate)).toBe(true);
    expect(isNearScaleBoundary(11.5, rate)).toBe(true);
    expect(isNearScaleBoundary(16, rate)).toBe(false);
  });
});

describe("state labels", () => {
  it("maps shell state to a status label", () => {
    expect(shellStateLabel("idle")).toBe("Idle");
    expect(shellStateLabel("starting")).toBe("Starting camera...");
    expect(shellStateLabel("calibrating")).toBe("Calibrating");
    expect(shellStateLabel("live")).toBe("Live");
    expect(shellStateLabel("paused")).toBe("Paused");
    expect(shellStateLabel("camera-error")).toBe("Camera error");
  });

  it("maps blink class and camera error copy", () => {
    expect(blinkClassLabel("full")).toBe("Full");
    expect(blinkClassLabel("partial")).toBe("Partial");
    expect(blinkClassLabel("unsure")).toBe("Unsure");
    expect(cameraErrorKind("Camera permission was blocked. Allow the camera in the address bar.")).toBe(
      "denied",
    );
    expect(cameraErrorKind("No camera was found on this device.")).toBe("not-found");
    expect(cameraErrorKind("The camera is already in use by another application.")).toBe("in-use");
    expect(cameraErrorKind("Could not start the camera.")).toBe("other");
  });
});
