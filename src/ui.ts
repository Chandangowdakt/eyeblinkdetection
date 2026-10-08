import type { RejectionCounts, RejectionReason } from "./eventValidation";
import { REJECTION_REASONS } from "./eventValidation";
import { formatLowFpsBanner, formatRejectedCount } from "./format";
import type { Scale } from "./scales";

export type ShellState = "idle" | "starting" | "calibrating" | "live" | "paused" | "camera-error";
export type PanelTab = "log" | "rejected" | "diagnostics";
export type CameraErrorKind = "denied" | "not-found" | "in-use" | "other";
export type LowFpsState = { active: boolean; belowSince: number | null; recoverSince: number | null };

export const EMPTY_LOW_FPS: LowFpsState = { active: false, belowSince: null, recoverSince: null };

export const REJECTION_TOOLTIPS: Record<RejectionReason, string> = {
  tooShort: "Fewer than 2 closed frames, or under the minimum length. At low frame rates, fast normal blinks can land here.",
  tooLong: "The eyes stayed closed longer than a typical blink.",
  wink: "One eyelid dipped much more than the other, so it looked like a wink.",
  faceLost: "The face dropped out of view while the blink was still forming.",
  poseInvalid: "The head turned, tilted, or moved too much during the blink.",
  gap: "Frames went missing in the middle of the blink, so the timing could not be trusted.",
};

export const PANEL_TABS: PanelTab[] = ["log", "rejected", "diagnostics"];

const COUNT_CHANGE_FLAGS = [
  "opt-partial",
  "opt-recovery",
  "opt-pitch",
  "opt-custom-start",
  "opt-adaptive",
  "opt-start",
  "opt-pose-limit",
] as const;

export function resolvePanelTab(value: string | null | undefined, current: PanelTab = "log"): PanelTab {
  return PANEL_TABS.includes(value as PanelTab) ? (value as PanelTab) : current;
}

export function shellStateLabel(state: ShellState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "starting":
      return "Starting camera...";
    case "calibrating":
      return "Calibrating";
    case "live":
      return "Live";
    case "paused":
      return "Paused";
    case "camera-error":
      return "Camera error";
  }
}

export function blinkClassLabel(klass: string): "Full" | "Partial" | "Unsure" {
  if (klass === "full") return "Full";
  if (klass === "partial") return "Partial";
  return "Unsure";
}

export function shouldIgnoreShortcutTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "OPTION";
}

export function shortcutAction(
  event: { key: string; target: { tagName?: string; isContentEditable?: boolean } | null },
  dialogOpen: boolean,
): "toggle-run" | "close-dialog" | null {
  if (event.key === "Escape") return dialogOpen ? "close-dialog" : null;
  if (event.key !== " " && event.key !== "Spacebar") return null;
  if (dialogOpen || shouldIgnoreShortcutTarget(event.target)) return null;
  return "toggle-run";
}

export function cameraErrorKind(message: string): CameraErrorKind {
  const text = message.toLowerCase();
  if (text.includes("permission") || text.includes("blocked") || text.includes("allow the camera")) {
    return "denied";
  }
  if (text.includes("no camera") || text.includes("not found")) return "not-found";
  if (text.includes("already in use")) return "in-use";
  return "other";
}

export function cameraErrorHelp(kind: CameraErrorKind): { title: string; steps: string[] } {
  if (kind === "denied") {
    return {
      title: "Camera access was blocked",
      steps: ["Click the lock icon in the address bar", "Allow the camera", "Reload this page"],
    };
  }
  if (kind === "not-found") {
    return {
      title: "No camera was found",
      steps: ["Check that a camera is plugged in or enabled", "Then click Retry"],
    };
  }
  if (kind === "in-use") {
    return {
      title: "The camera is already in use",
      steps: ["Close the other app using the camera", "Then click Retry"],
    };
  }
  return {
    title: "Could not start the camera",
    steps: ["Check the message above", "Then click Retry"],
  };
}

export function stepLowFps(prev: LowFpsState, fps: number, now: number): LowFpsState {
  const holdMs = 5000;
  let { active, belowSince, recoverSince } = prev;
  if (fps < 24) {
    recoverSince = null;
    belowSince = belowSince ?? now;
    if (!active && now - belowSince >= holdMs) active = true;
  } else {
    belowSince = null;
  }
  if (active) {
    if (fps >= 26) {
      recoverSince = recoverSince ?? now;
      if (now - recoverSince >= holdMs) {
        active = false;
        recoverSince = null;
      }
    } else {
      recoverSince = null;
    }
  }
  return { active, belowSince, recoverSince };
}

export function isNearScaleBoundary(value: number, scale: Scale, band = 0.5): boolean {
  const edges =
    scale.kind === "partial"
      ? [25, 50, 75]
      : [
          scale.bounds.veryLow,
          scale.bounds.low,
          scale.bounds.below,
          scale.bounds.greenMax,
          scale.bounds.above,
          scale.bounds.high,
        ];
  return edges.some((edge) => Math.abs(value - edge) <= band);
}

export function setText(el: HTMLElement, text: string): boolean {
  if (el.textContent === text) return false;
  el.textContent = text;
  return true;
}

export function syncMeter(bar: HTMLElement, value: number | null, label: string): void {
  const now = value == null || Number.isNaN(value) ? 0 : Math.round(value);
  const text = value == null || Number.isNaN(value) || !label ? "No reading" : label;
  const nowText = String(now);
  if (bar.getAttribute("aria-valuenow") !== nowText) bar.setAttribute("aria-valuenow", nowText);
  if (bar.getAttribute("aria-valuetext") !== text) bar.setAttribute("aria-valuetext", text);
}

let shellState: ShellState = "idle";
let activeTab: PanelTab = "log";
let blinkFlashTimer = 0;

export function setShellState(state: ShellState): void {
  if (shellState === state) return;
  shellState = state;
  const app = document.querySelector(".app");
  if (app instanceof HTMLElement) app.dataset.shell = state;
}

export function setAcquiring(on: boolean): void {
  const app = document.querySelector(".app");
  if (app instanceof HTMLElement) app.classList.toggle("is-acquiring", on);
}

export function setCalibrationProgress(count: number, target: number, complete: boolean, visible = false): void {
  const overlay = document.getElementById("cal-overlay");
  const fill = document.getElementById("cal-progress");
  const track = document.getElementById("cal-track");
  const label = document.getElementById("cal-overlay-text");
  const ratio = target > 0 ? Math.min(1, Math.max(0, count / target)) : 0;
  if (overlay) overlay.hidden = !visible || complete;
  if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
  if (track) {
    track.setAttribute("aria-valuenow", String(count));
    track.setAttribute("aria-valuemax", String(target));
    track.setAttribute("aria-valuetext", complete ? "Calibration complete" : `${count} of ${target}, blink fully`);
  }
  if (label) setText(label, complete ? "Calibration complete" : `${count}/${target}, blink fully`);
}

export function prependBlinkLogRow(
  n: number,
  klass: string,
  durationMs: number,
  closure: number,
  depth: number,
): void {
  const body = document.getElementById("blink-log");
  if (!body) return;
  const tr = document.createElement("tr");
  const label = blinkClassLabel(klass);
  const num = document.createElement("td");
  setText(num, String(n));
  const cls = document.createElement("td");
  const chip = document.createElement("span");
  chip.className = `class-chip class-chip-${klass === "full" || klass === "partial" ? klass : "unsure"}`;
  const icon = document.createElement("i");
  icon.className = "class-mark";
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  setText(text, label);
  chip.append(icon, text);
  cls.append(chip);
  const dur = document.createElement("td");
  setText(dur, `${Math.round(durationMs)} ms`);
  const clo = document.createElement("td");
  setText(clo, `${Math.round(closure * 100)}%`);
  const drop = document.createElement("td");
  setText(drop, `${Math.round(depth * 100)}%`);
  tr.append(num, cls, dur, clo, drop);
  body.prepend(tr);
}

export function clearBlinkLog(): void {
  document.getElementById("blink-log")?.replaceChildren();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function pulseBlinkFeedback(): void {
  if (prefersReducedMotion()) return;
  const count = document.getElementById("blink-count");
  const flash = document.getElementById("blink-flash");
  if (count) {
    count.classList.remove("count-pulse");
    void count.offsetWidth;
    count.classList.add("count-pulse");
  }
  if (!flash) return;
  flash.hidden = false;
  flash.classList.add("is-on");
  window.clearTimeout(blinkFlashTimer);
  blinkFlashTimer = window.setTimeout(() => {
    flash.classList.remove("is-on");
    flash.hidden = true;
  }, 280);
}

export function applyCameraError(message: string): void {
  setShellState("camera-error");
  const help = cameraErrorHelp(cameraErrorKind(message));
  const title = document.getElementById("camera-error-title");
  const steps = document.getElementById("camera-error-steps");
  if (title) setText(title, help.title);
  if (steps) {
    steps.replaceChildren();
    for (const line of help.steps) {
      const item = document.createElement("li");
      setText(item, line);
      steps.append(item);
    }
  }
}

export function setLowFpsWarning(active: boolean, fps: number): void {
  const banner = document.getElementById("low-fps-banner");
  const tag = document.getElementById("partial-low-fps");
  if (banner) {
    banner.classList.toggle("show", active);
    banner.hidden = !active;
    if (active) setText(banner, formatLowFpsBanner(fps));
  }
  if (tag) {
    tag.classList.toggle("hidden", !active);
    tag.hidden = !active;
  }
}

export function setNearBoundary(id: string, on: boolean): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !on);
  el.hidden = !on;
}

let lastRejectedKey = "";

export function renderRejectedReasonChips(counts: RejectionCounts, total: number): void {
  const countEl = document.getElementById("rejected-count");
  const reasonsEl = document.getElementById("rejected-reasons");
  const heading = formatRejectedCount(total);
  if (countEl) setText(countEl, heading);
  const key = REJECTION_REASONS.map((reason) => `${reason}:${counts[reason]}`).join("|");
  if (!reasonsEl || key === lastRejectedKey) return;
  lastRejectedKey = key;
  reasonsEl.replaceChildren();
  for (const reason of REJECTION_REASONS) {
    const chip = document.createElement("span");
    chip.className = "reason-chip";
    chip.title = REJECTION_TOOLTIPS[reason];
    const tip = document.createElement("span");
    tip.id = `tip-${reason}`;
    tip.className = "tooltip";
    tip.setAttribute("role", "tooltip");
    setText(tip, REJECTION_TOOLTIPS[reason]);
    chip.setAttribute("aria-describedby", tip.id);
    const label = document.createElement("span");
    setText(label, `${reason} ${counts[reason]}`);
    chip.append(label, tip);
    reasonsEl.append(chip);
  }
}

function shortcutTarget(target: EventTarget | null): { tagName?: string; isContentEditable?: boolean } | null {
  if (!(target instanceof HTMLElement)) return null;
  return { tagName: target.tagName, isContentEditable: target.isContentEditable };
}

function setTab(next: PanelTab): void {
  activeTab = resolvePanelTab(next, activeTab);
  const buttons = document.querySelectorAll<HTMLElement>("[data-tab]");
  for (const button of buttons) {
    const selected = button.dataset.tab === activeTab;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  }
  for (const id of PANEL_TABS) {
    const panel = document.getElementById(`panel-${id}`);
    if (panel) panel.hidden = id !== activeTab;
  }
}

function syncChartMode(showOpenness: boolean): void {
  const ear = document.getElementById("chart-mode-ear");
  const open = document.getElementById("chart-mode-open");
  ear?.setAttribute("aria-pressed", showOpenness ? "false" : "true");
  open?.setAttribute("aria-pressed", showOpenness ? "true" : "false");
}

function mirrorText(fromId: string, toId: string): void {
  const from = document.getElementById(fromId);
  const to = document.getElementById(toId);
  if (!from || !to) return;
  const copy = () => setText(to, from.textContent ?? "");
  copy();
  new MutationObserver(copy).observe(from, { childList: true, characterData: true, subtree: true });
}

function toggleRun(): void {
  const live = document.querySelector(".app")?.classList.contains("is-live");
  const start = document.getElementById("start-btn");
  const stop = document.getElementById("stop-btn");
  if (live) stop?.click();
  else start?.click();
}

export function initShellUi(): void {
  const app = document.querySelector(".app");
  if (app instanceof HTMLElement && !app.dataset.shell) app.dataset.shell = "idle";

  const dialog = document.getElementById("settings-dialog");
  const gear = document.getElementById("settings-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const form = document.getElementById("settings-panel");
  const idleStart = document.getElementById("idle-start-btn");
  const retry = document.getElementById("retry-camera-btn");
  const start = document.getElementById("start-btn");
  const openness = document.getElementById("openness-toggle");
  const earBtn = document.getElementById("chart-mode-ear");
  const openBtn = document.getElementById("chart-mode-open");

  idleStart?.addEventListener("click", () => start?.click());
  retry?.addEventListener("click", () => start?.click());
  form?.addEventListener("submit", (event) => event.preventDefault());

  if (dialog instanceof HTMLDialogElement && gear instanceof HTMLButtonElement) {
    gear.addEventListener("click", () => {
      dialog.showModal();
    });
    closeBtn?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      gear.focus();
    });
  }

  document.querySelector(".tab-list")?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tab]") : null;
    if (!button) return;
    setTab(resolvePanelTab(button.dataset.tab, activeTab));
  });
  setTab(activeTab);

  const setOpenness = (on: boolean) => {
    if (openness instanceof HTMLInputElement) {
      if (openness.checked !== on) {
        openness.checked = on;
        openness.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    syncChartMode(on);
  };
  earBtn?.addEventListener("click", () => setOpenness(false));
  openBtn?.addEventListener("click", () => setOpenness(true));
  if (openness instanceof HTMLInputElement) {
    syncChartMode(openness.checked);
    openness.addEventListener("change", () => syncChartMode(openness.checked));
  }

  document.addEventListener("keydown", (event) => {
    const open = dialog instanceof HTMLDialogElement && dialog.open;
    const action = shortcutAction({ key: event.key, target: shortcutTarget(event.target) }, open);
    if (action === "close-dialog") {
      if (dialog instanceof HTMLDialogElement) dialog.close();
      event.preventDefault();
      return;
    }
    if (action === "toggle-run") {
      event.preventDefault();
      toggleRun();
    }
  });

  mirrorText("eye-state", "hud-eye");
  mirrorText("face-state", "hud-face");
  mirrorText("fps-pill", "hud-fps");

  for (const id of COUNT_CHANGE_FLAGS) {
    document.getElementById(id)?.closest(".setting")?.classList.add("changes-count");
  }
}
