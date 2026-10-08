import "./styles.css";
import { BlinkDetector } from "./blinkDetector";
import { cameraErrorMessage, startCamera, stopCamera } from "./camera";
import {
  bothEyesVisible,
  faceAnchor,
  faceMoved,
  isFrontalFace,
  meanEar,
  type FaceAnchor,
  type Point,
} from "./ear";
import { createFaceLandmarker, detectFace } from "./landmarker";
import { formatPose, poseFromMatrix } from "./pose";
import { drawEarChart, drawStage, resetEarChart, resizeOverlay } from "./overlay";
import { FrameRecorder } from "./recorder";
import { OPEN_FRAC_LEGACY } from "./adaptive";
import { AdaptiveCalibration, ClosedFloorCalibration } from "./calibration";
import { SessionMetrics } from "./metrics";
import { SubjectCalibration } from "./subjectProfile";
import { PartialCandidateTracker } from "./partialCandidates";
import {
  LEGACY_MAX_BLINK_MS,
  LEGACY_MIN_BLINK_MS,
  STRICT_MAX_MS,
  STRICT_MIN_MS,
} from "./eventValidation";
import {
  countingFooterText,
  formatClosedFloor,
  formatDetectorLines,
  formatHeroRateValue,
  formatPartialHeadline,
  formatPartialSession,
  formatPartialWindow,
  formatSessionAverage,
  formatSubjectTiming,
} from "./format";
import { VALLEY_MS } from "./timing";
import { PERF_ENABLED, maybeLogPerf, noteProcessedTick, noteRvfcTick, resetPerf, timed } from "./perf";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, sanitizeRateBounds, type AppSettings } from "./settings";
import type { ChartMarkerKind } from "./overlay";
import {
  PARTIAL_SCALE,
  RATE_PRESETS,
  markerRatio,
  rateSegmentWeights,
  scaleView,
  type RatePresetName,
  type ScaleResult,
} from "./scales";
import {
  EMPTY_LOW_FPS,
  applyCameraError,
  clearBlinkLog,
  initShellUi,
  isNearScaleBoundary,
  prependBlinkLogRow,
  pulseBlinkFeedback,
  renderRejectedReasonChips,
  setAcquiring,
  setCalibrationProgress,
  setLowFpsWarning,
  setNearBoundary,
  setShellState,
  setText,
  stepLowFps,
  syncMeter,
} from "./ui";

const STATS_MS = 100;
const SCALE_MS = 1000;

function countingHint(): string {
  return countingFooterText(VALLEY_MS, LEGACY_MIN_BLINK_MS, LEGACY_MAX_BLINK_MS, STRICT_MIN_MS, STRICT_MAX_MS);
}

const video = document.querySelector<HTMLVideoElement>("#webcam")!;
const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
const earChart = document.querySelector<HTMLCanvasElement>("#ear-chart")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop-btn")!;
const resetBtn = document.querySelector<HTMLButtonElement>("#reset-btn")!;
const exportFramesBtn = document.querySelector<HTMLButtonElement>("#export-frames-btn")!;
const exportBlinksBtn = document.querySelector<HTMLButtonElement>("#export-blinks-btn")!;
const closedFloorEl = document.querySelector<HTMLElement>("#closed-floor")!;
const rate60El = document.querySelector<HTMLElement>("#rate-60")!;
const rateUnitEl = document.querySelector<HTMLElement>("#rate-unit")!;
const ratePausedEl = document.querySelector<HTMLElement>("#rate-paused")!;
const partialPctEl = document.querySelector<HTMLElement>("#partial-pct")!;
const partialWindowEl = document.querySelector<HTMLElement>("#partial-window")!;
const partialSessionEl = document.querySelector<HTMLElement>("#partial-session")!;
const partialPausedEl = document.querySelector<HTMLElement>("#partial-paused")!;
const poseReadoutEl = document.querySelector<HTMLElement>("#pose-readout")!;
const blinkCountEl = document.querySelector<HTMLElement>("#blink-count")!;
const blinkRateEl = document.querySelector<HTMLElement>("#blink-rate")!;
const leftEarEl = document.querySelector<HTMLElement>("#left-ear")!;
const rightEarEl = document.querySelector<HTMLElement>("#right-ear")!;
const earStatsEl = document.querySelector<HTMLElement>("#ear-stats")!;
const eyeStateEl = document.querySelector<HTMLElement>("#eye-state")!;
const faceStateEl = document.querySelector<HTMLElement>("#face-state")!;
const thresholdEl = document.querySelector<HTMLElement>("#threshold-value")!;
const enginePill = document.querySelector<HTMLElement>("#engine-pill")!;
const fpsPill = document.querySelector<HTMLElement>("#fps-pill")!;
const scrim = document.querySelector<HTMLElement>("#scrim")!;
const scrimCopy = document.querySelector<HTMLElement>("#scrim-copy")!;
const hint = document.querySelector<HTMLElement>("#hint")!;
const coach = document.querySelector<HTMLElement>("#coach")!;
const app = document.querySelector<HTMLElement>(".app")!;
const opennessToggle = document.querySelector<HTMLInputElement>("#openness-toggle")!;
const partialCandidatesEl = document.querySelector<HTMLElement>("#partial-candidates")!;
const optPartial = document.querySelector<HTMLInputElement>("#opt-partial")!;
const optRecovery = document.querySelector<HTMLInputElement>("#opt-recovery")!;
const optPitch = document.querySelector<HTMLInputElement>("#opt-pitch")!;
const optCustomStart = document.querySelector<HTMLInputElement>("#opt-custom-start")!;
const optStart = document.querySelector<HTMLInputElement>("#opt-start")!;
const optFull = document.querySelector<HTMLInputElement>("#opt-full")!;
const optPoseLimit = document.querySelector<HTMLInputElement>("#opt-pose-limit")!;
const optFps = document.querySelector<HTMLSelectElement>("#opt-fps")!;
const optAdaptive = document.querySelector<HTMLInputElement>("#opt-adaptive")!;
const optCalBlinks = document.querySelector<HTMLSelectElement>("#opt-cal-blinks")!;
const resetSettingsBtn = document.querySelector<HTMLButtonElement>("#reset-settings-btn")!;
const recalibrateBtn = document.querySelector<HTMLButtonElement>("#recalibrate-btn")!;
const recalibrateBanner = document.querySelector<HTMLElement>("#recalibrate-banner")!;
const noisyChip = document.querySelector<HTMLElement>("#noisy-chip")!;
const rateScaleEl = document.querySelector<HTMLElement>("#rate-scale")!;
const rateScaleMarker = document.querySelector<HTMLElement>("#rate-scale-marker")!;
const rateScaleLabel = document.querySelector<HTMLElement>("#rate-scale-label")!;
const partialScaleEl = document.querySelector<HTMLElement>("#partial-scale")!;
const partialScaleMarker = document.querySelector<HTMLElement>("#partial-scale-marker")!;
const partialScaleLabel = document.querySelector<HTMLElement>("#partial-scale-label")!;
const optRatePreset = document.querySelector<HTMLSelectElement>("#opt-rate-preset")!;
const optRateVeryLow = document.querySelector<HTMLInputElement>("#opt-rate-verylow")!;
const optRateLow = document.querySelector<HTMLInputElement>("#opt-rate-low")!;
const optRateBelow = document.querySelector<HTMLInputElement>("#opt-rate-below")!;
const optRateGreenMax = document.querySelector<HTMLInputElement>("#opt-rate-greenmax")!;
const optRateAbove = document.querySelector<HTMLInputElement>("#opt-rate-above")!;
const optRateHigh = document.querySelector<HTMLInputElement>("#opt-rate-high")!;
const optStrictEvents = document.querySelector<HTMLInputElement>("#opt-strict-events")!;
const optStrictMin = document.querySelector<HTMLInputElement>("#opt-strict-min")!;
const optStrictMax = document.querySelector<HTMLInputElement>("#opt-strict-max")!;
const optWinkDip = document.querySelector<HTMLInputElement>("#opt-wink-dip")!;
const optWinkAsym = document.querySelector<HTMLInputElement>("#opt-wink-asym")!;
const rejectedLogEl = document.querySelector<HTMLOListElement>("#rejected-log")!;

function applySettingsToForm(): void {
  optPartial.checked = settings.partialCandidates;
  optRecovery.checked = settings.recoveryLine;
  optPitch.checked = settings.pitchGating;
  optCustomStart.checked = settings.useCustomStartLine;
  optStart.value = String(Math.round(settings.startLineFrac * 100));
  optFull.value = String(Math.round(settings.fullBlinkClosure * 100));
  optPoseLimit.value = String(settings.pitchLimit);
  optFps.value = String(settings.fpsMode);
  opennessToggle.checked = settings.showOpenness;
  optAdaptive.checked = settings.adaptiveThreshold;
  optCalBlinks.value = String(settings.calibrationBlinks);
  optRatePreset.value = settings.ratePreset;
  optRateVeryLow.value = String(settings.rateBounds.veryLow);
  optRateLow.value = String(settings.rateBounds.low);
  optRateBelow.value = String(settings.rateBounds.below);
  optRateGreenMax.value = String(settings.rateBounds.greenMax);
  optRateAbove.value = String(settings.rateBounds.above);
  optRateHigh.value = String(settings.rateBounds.high);
  optStrictEvents.checked = settings.strictEventValidation;
  optStrictMin.value = String(settings.strictMinMs);
  optStrictMax.value = String(settings.strictMaxMs);
  optWinkDip.value = String(settings.winkDipMax);
  optWinkAsym.value = String(settings.winkAsymMax);
}

function readSettingsFromForm(): AppSettings {
  return {
    partialCandidates: optPartial.checked,
    recoveryLine: optRecovery.checked,
    pitchGating: optPitch.checked,
    useCustomStartLine: optCustomStart.checked,
    pitchLimit: Number(optPoseLimit.value) || 25,
    fpsMode: optFps.value === "60" ? 60 : 30,
    showOpenness: opennessToggle.checked,
    startLineFrac: (Number(optStart.value) || 70) / 100,
    fullBlinkClosure: (Number(optFull.value) || 80) / 100,
    adaptiveThreshold: optAdaptive.checked,
    calibrationBlinks: optCalBlinks.value === "5" ? 5 : 10,
    ratePreset: optRatePreset.value === "screen" ? "screen" : "resting",
    rateBounds: {
      veryLow: Number(optRateVeryLow.value) || 5,
      low: Number(optRateLow.value) || 8,
      below: Number(optRateBelow.value) || 12,
      greenMax: Number(optRateGreenMax.value) || 20,
      above: Number(optRateAbove.value) || 25,
      high: Number(optRateHigh.value) || 30,
    },
    strictEventValidation: optStrictEvents.checked,
    strictMinMs: Number(optStrictMin.value) || 60,
    strictMaxMs: Number(optStrictMax.value) || 500,
    winkDipMax: Number(optWinkDip.value) || 0.8,
    winkAsymMax: Number(optWinkAsym.value) || 0.35,
  };
}

function applyStartLineToDetector(): void {
  detector.setCustomStartLine(settings.useCustomStartLine ? settings.startLineFrac : null);
}

function syncStrictDetector(): void {
  detector.setStrictValidation({
    enabled: settings.strictEventValidation,
    minMs: settings.strictMinMs,
    maxMs: settings.strictMaxMs,
    dipMax: settings.winkDipMax,
    asymMax: settings.winkAsymMax,
  });
}

function renderRejectedUi(): void {
  const counts = detector.rejections;
  const total = counts.tooShort + counts.tooLong + counts.wink + counts.faceLost + counts.poseInvalid + counts.gap;
  renderRejectedReasonChips(counts, total);
  rejectedLogEl.replaceChildren();
  const rows = detector.rejectedEvents.slice(-40).reverse();
  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = `${row.reason}${row.durationMs > 0 ? ` · ${Math.round(row.durationMs)} ms` : ""}`;
    rejectedLogEl.append(item);
  }
}

function persistSettings(): void {
  const next = readSettingsFromForm();
  next.rateBounds = sanitizeRateBounds(next.rateBounds, next.ratePreset);
  settings = next;
  saveSettings(settings);
  applySettingsToForm();
  applyStartLineToDetector();
  syncStrictDetector();
  adaptiveCal.setTarget(settings.calibrationBlinks);
  syncAdaptiveDetector();
  lastRateScale = null;
  layoutRateSegments();
  updateScaleUi(performance.now(), true);
}

function syncAdaptiveDetector(): void {
  if (settings.adaptiveThreshold) {
    detector.setAdaptiveClosedRatio(adaptiveCal.complete ? adaptiveCal.r : null);
    return;
  }
  detector.setAdaptiveClosedRatio(closedFloor.complete ? (subjectCal.profile?.r ?? closedFloor.r) : null);
}

function clearScoredResults(): void {
  sessionMetrics.reset(performance.now());
  partialTracker.reset();
  chartMarkers.length = 0;
  clearBlinkLog();
  lastBlinkCount = -1;
  lastRateScale = null;
  lastPartialScale = null;
  setText(blinkCountEl, "—");
  setText(blinkRateEl, "—");
  setText(rate60El, "—");
  rateUnitEl.hidden = true;
  setText(partialPctEl, "—");
  setText(partialWindowEl, "Collecting full blinks");
  setText(partialSessionEl, "Scoring starts after calibration");
  partialPctEl.classList.remove("low-sample");
}

function applySubjectProfileAndArmScoring(): void {
  const profile = subjectCal.finish();
  if (profile) {
    detector.setDurationWindow(profile.minMs, profile.maxMs);
    liveFullClosure = profile.fullClosure;
  } else {
    detector.setDurationWindow(null);
    liveFullClosure = settings.fullBlinkClosure;
  }
  syncAdaptiveDetector();
  detector.resetCount();
  analysisStartedAt = performance.now();
  sessionMetrics.reset(analysisStartedAt);
  partialTracker.reset();
  chartMarkers.length = 0;
  clearBlinkLog();
  lastBlinkCount = -1;
  lastRateScale = null;
  lastPartialScale = null;
  setText(blinkCountEl, "0");
  setText(blinkRateEl, formatSessionAverage(0));
  setText(rate60El, "—");
  rateUnitEl.hidden = true;
  setText(partialPctEl, "—");
  setText(partialWindowEl, "—");
  setText(partialSessionEl, "Session —");
  partialPctEl.classList.remove("low-sample");
  setText(hint, countingHint());
  setCoach(false);
}

function resetAcquisition(): void {
  subjectCal.reset();
  closedFloor.reset();
  adaptiveCal.reset();
  adaptiveCal.setTarget(settings.calibrationBlinks);
  detector.setDurationWindow(null);
  liveFullClosure = settings.fullBlinkClosure;
  syncAdaptiveDetector();
}

function updateCalibrationUi(): void {
  const acquiring = isAcquiring();
  setAcquiring(acquiring);
  if (settings.adaptiveThreshold) {
    const timing = formatSubjectTiming(subjectCal.profile);
    const line = adaptiveCal.inconsistent
      ? adaptiveCal.label
      : adaptiveCal.complete
        ? adaptiveCal.liveLine(detector.baseline, detector.closeThreshold)
        : adaptiveCal.label;
    setText(closedFloorEl, timing && adaptiveCal.complete && !adaptiveCal.inconsistent ? `${line}. ${timing}` : line);
    setCalibrationProgress(adaptiveCal.count, adaptiveCal.target, adaptiveCal.complete, running);
    if (running) setShellState(adaptiveCal.complete ? "live" : "calibrating");
  } else {
    const floorText = formatClosedFloor({
      complete: closedFloor.complete,
      count: closedFloor.count,
      target: closedFloor.target,
      r: closedFloor.r,
      baseline: detector.baseline,
    });
    const timing = formatSubjectTiming(subjectCal.profile);
    setText(closedFloorEl, timing && closedFloor.complete ? `${floorText}. ${timing}` : floorText);
    setCalibrationProgress(closedFloor.count, closedFloor.target, closedFloor.complete, running);
    if (running) setShellState(closedFloor.complete ? "live" : "calibrating");
  }
  noisyChip.classList.toggle("hidden", !(settings.adaptiveThreshold && detector.signalNoisy));
}

function setPausedTags(paused: boolean): void {
  ratePausedEl.classList.toggle("hidden", !paused);
  partialPausedEl.classList.toggle("hidden", !paused);
}

function renderPartialUi(): void {
  if (isAcquiring()) {
    setText(partialPctEl, "—");
    setText(partialWindowEl, "Collecting full blinks");
    setText(partialSessionEl, "Scoring starts after calibration");
    partialPctEl.classList.remove("low-sample");
    return;
  }
  const window = sessionMetrics.windowPartialCounts();
  const session = sessionMetrics.sessionPartialCounts();
  setText(partialPctEl, formatPartialHeadline(sessionMetrics.partialPercent()));
  setText(partialWindowEl, formatPartialWindow(window.partial, window.m, window.unsure));
  setText(partialSessionEl, formatPartialSession(session.partial, session.m));
  partialPctEl.classList.toggle("low-sample", sessionMetrics.partialSampleState() === "low");
}

function layoutRateSegments(): void {
  const weights = rateSegmentWeights(settings.rateBounds);
  const segs = rateScaleEl.querySelectorAll<HTMLElement>(".seg");
  segs.forEach((seg, index) => {
    seg.style.flexGrow = String(weights[index] ?? 1);
  });
}

function paintScale(
  bar: HTMLElement,
  marker: HTMLElement,
  caption: HTMLElement,
  value: number | null,
  view: { level: string; label: string },
  scale: Parameters<typeof markerRatio>[1],
): void {
  bar.dataset.level = view.level;
  caption.dataset.level = view.level;
  setText(caption, view.label);
  syncMeter(bar, value, view.label);
  if (value != null && view.level !== "grey") {
    marker.style.left = `${markerRatio(value, scale) * 100}%`;
  }
}

function updateScaleUi(now: number, force = false): void {
  if (!force && now - lastScaleUiAt < SCALE_MS) return;
  lastScaleUiAt = now;
  const rateScale = { kind: "rate" as const, bounds: settings.rateBounds };
  if (isAcquiring()) {
    lastRateScale = null;
    lastPartialScale = null;
    paintScale(rateScaleEl, rateScaleMarker, rateScaleLabel, null, { level: "grey", label: "Calibrating" }, rateScale);
    paintScale(partialScaleEl, partialScaleMarker, partialScaleLabel, null, { level: "grey", label: "Calibrating" }, PARTIAL_SCALE);
    setNearBoundary("rate-near", false);
    setNearBoundary("partial-near", false);
    return;
  }
  const rateValue = sessionMetrics.rollingRatePerMin(now);
  const rate = scaleView(
    rateValue,
    { kind: "rate", bounds: settings.rateBounds },
    rateValue != null,
    lastRateScale,
  );
  lastRateScale = rate.stored;
  paintScale(rateScaleEl, rateScaleMarker, rateScaleLabel, rateValue, rate.view, rateScale);
  setNearBoundary("rate-near", rateValue != null && isNearScaleBoundary(rateValue, rateScale));

  const partialValue = sessionMetrics.partialPercent();
  const partial = scaleView(partialValue, PARTIAL_SCALE, partialValue != null, lastPartialScale);
  lastPartialScale = partial.stored;
  paintScale(partialScaleEl, partialScaleMarker, partialScaleLabel, partialValue, partial.view, PARTIAL_SCALE);
  setNearBoundary("partial-near", partialValue != null && isNearScaleBoundary(partialValue, PARTIAL_SCALE));
}

const detector = new BlinkDetector();
const frameRecorder = new FrameRecorder();
const closedFloor = new ClosedFloorCalibration();
const adaptiveCal = new AdaptiveCalibration();
const subjectCal = new SubjectCalibration();
const sessionMetrics = new SessionMetrics();
const partialTracker = new PartialCandidateTracker();
let settings: AppSettings = loadSettings();
const chartMarkers: Array<{ kind: ChartMarkerKind; born: number }> = [];
let overlayFrames = 0;
let lockedBaseline = 0;
const canUseVideoFrameCallback = typeof video.requestVideoFrameCallback === "function";

let stream: MediaStream | null = null;
let landmarker: Awaited<ReturnType<typeof createFaceLandmarker>>["landmarker"] | null = null;
let modelDelegate: "GPU" | "CPU" | null = null;
let lowFpsState = EMPTY_LOW_FPS;
let running = false;
let startInFlight = false;
let rafId = 0;
let videoFrameHandle = 0;
let lastProcessAt = 0;
let lastTimestamp = 0;
let lastVideoTime = -1;
let lastStatsAt = 0;
let lastScaleUiAt = 0;
let lastRateScale: ScaleResult | null = null;
let lastPartialScale: ScaleResult | null = null;
let framesThisSecond = 0;
let fpsWindowStart = 0;
let analysisStartedAt = 0;
let lastBlinkCount = -1;
let lastHintCalibrated = false;
let lastFaceFound: boolean | null = null;
let lastBothEyes: boolean | null = null;
let lastTilted: boolean | null = null;
let lastMoving: boolean | null = null;
let lastClosed: boolean | null = null;
let previousAnchor: FaceAnchor | null = null;
let lastEngineKind: "ok" | "warn" | "" = "";
let lastEngineText = "";
let lastFpsKind: "ok" | "warn" | "" = "";
let lastFpsText = "";
let liveFullClosure = settings.fullBlinkClosure;

function calibrationComplete(): boolean {
  return settings.adaptiveThreshold ? adaptiveCal.complete : closedFloor.complete;
}

function isAcquiring(): boolean {
  return !calibrationComplete();
}

function scoredClosedRatio(): number {
  if (settings.adaptiveThreshold && adaptiveCal.complete) return adaptiveCal.r;
  return subjectCal.profile?.r ?? closedFloor.r;
}

function acquisitionPrompt(): string {
  const count = settings.adaptiveThreshold ? adaptiveCal.count : closedFloor.count;
  const target = settings.adaptiveThreshold ? adaptiveCal.target : closedFloor.target;
  return `Blink fully, naturally. ${count} of ${target} recorded. Scoring starts after calibration.`;
}

function setPill(el: HTMLElement, text: string, kind: "ok" | "warn" | ""): void {
  const isEngine = el === enginePill;
  if (isEngine && text === lastEngineText && kind === lastEngineKind) return;
  if (!isEngine && text === lastFpsText && kind === lastFpsKind) return;

  el.textContent = text;
  el.classList.toggle("ok", kind === "ok");
  el.classList.toggle("warn", kind === "warn");

  if (isEngine) {
    lastEngineText = text;
    lastEngineKind = kind;
  } else {
    lastFpsText = text;
    lastFpsKind = kind;
  }
}

function setScrim(visible: boolean, message?: string): void {
  scrim.classList.toggle("hidden", !visible);
  scrim.setAttribute("aria-hidden", visible ? "false" : "true");
  if (message) setText(scrimCopy, message);
}

function setCoach(visible: boolean, message?: string): void {
  coach.classList.toggle("hidden", !visible);
  coach.setAttribute("aria-hidden", visible ? "false" : "true");
  if (message) setText(coach, message);
}

function setLive(live: boolean): void {
  app.classList.toggle("is-live", live);
  startBtn.hidden = live;
  startBtn.disabled = live;
  stopBtn.disabled = !live;
  stopBtn.classList.toggle("primary", live);
  stopBtn.classList.toggle("ghost", !live);
}

function renderBlinkCount(forceRate = false): void {
  if (isAcquiring()) {
    if (lastBlinkCount !== -2) {
      lastBlinkCount = -2;
      setText(blinkCountEl, "—");
      setText(blinkRateEl, "—");
    }
    return;
  }
  if (detector.blinkCount === lastBlinkCount && !forceRate) return;
  lastBlinkCount = detector.blinkCount;
  setText(blinkCountEl, String(detector.blinkCount));
  const elapsedMin = Math.max((performance.now() - analysisStartedAt) / 60000, 1 / 60);
  setText(blinkRateEl, formatSessionAverage(detector.blinkCount / elapsedMin));
}

function renderStats(
  faceFound: boolean,
  bothEyes: boolean,
  closed: boolean,
  tilted: boolean,
  moving: boolean,
  force = false,
): void {
  renderBlinkCount();

  const now = performance.now();
  if (!force && now - lastStatsAt < STATS_MS) return;
  lastStatsAt = now;

  if (isAcquiring()) {
    setText(blinkRateEl, "—");
    setText(rate60El, "—");
    rateUnitEl.hidden = true;
  } else {
    const elapsedMin = Math.max((now - analysisStartedAt) / 60000, 1 / 60);
    setText(blinkRateEl, formatSessionAverage(detector.blinkCount / elapsedMin));
    const rateValue = sessionMetrics.rollingRatePerMin(now);
    setText(rate60El, formatHeroRateValue(rateValue));
    rateUnitEl.hidden = rateValue == null;
  }
  renderPartialUi();
  updateScaleUi(now);
  renderRejectedUi();
  setText(leftEarEl, faceFound ? detector.left.toFixed(3) : "—");
  setText(rightEarEl, faceFound ? detector.right.toFixed(3) : "—");
  setText(
    earStatsEl,
    faceFound
      ? `${detector.avg.toFixed(3)} · ${detector.min.toFixed(3)} · ${detector.max.toFixed(3)}`
      : "—",
  );
  setText(thresholdEl, formatDetectorLines(detector.baseline, detector.closeThreshold, detector.calibrated));
  setText(
    eyeStateEl,
    !faceFound
      ? "No face"
      : !bothEyes
        ? "Need both eyes"
        : moving
          ? "Hold still"
          : tilted
            ? "Tilted"
            : closed
              ? "Closed"
              : "Open",
  );
  setText(
    faceStateEl,
    !faceFound
      ? "Searching"
      : !bothEyes
        ? "Reposition"
        : moving
          ? "Unstable"
          : tilted
            ? "Face camera"
            : "Locked",
  );
  if (detector.calibrated && lockedBaseline <= 0) lockedBaseline = detector.baseline;
  const drifted =
    lockedBaseline > 0 && Math.abs(detector.baseline - lockedBaseline) / lockedBaseline > 0.25;
  recalibrateBanner.classList.toggle("show", drifted);
  updateCalibrationUi();
}

function tickFps(now: number): void {
  framesThisSecond += 1;
  if (now - fpsWindowStart >= 1000) {
    const fps = framesThisSecond;
    framesThisSecond = 0;
    fpsWindowStart = now;
    lowFpsState = stepLowFps(lowFpsState, fps, now);
    setLowFpsWarning(lowFpsState.active, fps);
    setPill(fpsPill, `${fps} fps`, lowFpsState.active ? "warn" : fps >= 26 ? "ok" : "");
  }
}

function scheduleNextFrame(): void {
  if (!running) return;
  if (canUseVideoFrameCallback) {
    videoFrameHandle = video.requestVideoFrameCallback((now) => {
      processFrame(now);
    });
    return;
  }
  rafId = requestAnimationFrame(processFrame);
}

async function ensureModel(): Promise<void> {
  if (landmarker) return;
  startBtn.disabled = true;
  startBtn.textContent = "Loading model…";
  setPill(enginePill, "Loading model", "warn");
  setScrim(true, "Loading MediaPipe Face Landmarker…");
  const created = await createFaceLandmarker();
  landmarker = created.landmarker;
  modelDelegate = created.delegate;
  setPill(enginePill, modelDelegate, "ok");
  if (!running) {
    startBtn.disabled = false;
    startBtn.textContent = "Start";
    setScrim(true, "Model ready. Start analysis to begin tracking.");
  }
}

function processFrame(now: number): void {
  noteRvfcTick();
  if (!running || !landmarker) return;
  scheduleNextFrame();

  if (document.hidden) return;
  if (!canUseVideoFrameCallback && now - lastProcessAt < 1000 / settings.fpsMode) return;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  if (video.currentTime === lastVideoTime) return;
  noteProcessedTick();

  lastVideoTime = video.currentTime;
  lastProcessAt = now;

  resizeOverlay(overlay, video);

  const timestamp = Math.max(now, lastTimestamp + 1);
  lastTimestamp = timestamp;

  let landmarks: Point[] | null = null;
  let headPose = null as ReturnType<typeof poseFromMatrix>;
  const engine = landmarker;
  try {
    const result = timed("infer", () => detectFace(engine, video, timestamp));
    landmarks = (result.faceLandmarks[0] ?? null) as Point[] | null;
    headPose = poseFromMatrix(result.facialTransformationMatrixes?.[0]?.data);
  } catch {
    detector.lostFace();
    return;
  }

  setText(poseReadoutEl, formatPose(headPose));
  const faceFound = Boolean(landmarks);
  const bothEyes = Boolean(landmarks && bothEyesVisible(landmarks));
  let closed = false;
  let tilted = false;
  let moving = false;
  let leftClosed = false;
  let rightClosed = false;
  let leftEar: number | null = null;
  let rightEar: number | null = null;

  if (landmarks) {
    const ears = meanEar(landmarks);
    leftEar = ears.left;
    rightEar = ears.right;
    const anchor = faceAnchor(landmarks);
    moving = Boolean(anchor && previousAnchor && faceMoved(previousAnchor, anchor));
    previousAnchor = anchor;
    const frontal = isFrontalFace(landmarks);
    const pitchBlocked =
      settings.pitchGating && headPose != null && Math.abs(headPose.pitch) > settings.pitchLimit;
    sessionMetrics.noteFrame(now, true, bothEyes && frontal && !moving && !pitchBlocked);
    const snapshot = bothEyes
      ? detector.update(ears.left, ears.right, now, moving, frontal && !pitchBlocked)
      : detector.observe(ears.left, ears.right);
    if (!bothEyes) detector.noteInvalidFrame("poseInvalid", now);
    closed = snapshot.closed;
    tilted = snapshot.tilted;
    moving = snapshot.moving;
    leftClosed = snapshot.left < snapshot.closeThreshold;
    rightClosed = snapshot.right < snapshot.closeThreshold;
    if (snapshot.justBlinked) {
      if (snapshot.event) {
        const wasComplete = calibrationComplete();
        closedFloor.record(snapshot.event);
        if (settings.adaptiveThreshold) {
          const result = adaptiveCal.consider(
            snapshot.event,
            detector.earHistory,
            snapshot.event.baseline * OPEN_FRAC_LEGACY,
          );
          if (result.accepted && !wasComplete) subjectCal.record(snapshot.event);
          if (!result.accepted && result.ratio != null) setText(hint, result.message);
        } else if (!wasComplete) {
          subjectCal.record(snapshot.event);
        }
        const nowComplete = calibrationComplete();
        if (!wasComplete && nowComplete) {
          applySubjectProfileAndArmScoring();
          updateCalibrationUi();
          renderPartialUi();
          updateScaleUi(now, true);
        } else if (nowComplete) {
          renderBlinkCount(true);
          pulseBlinkFeedback();
          const logged = sessionMetrics.add(snapshot.event, scoredClosedRatio(), liveFullClosure, {
            history: detector.earHistory,
            closeLine: snapshot.closeThreshold,
            uncalibrated: false,
            r: scoredClosedRatio(),
            baselineOnset: snapshot.event.baseline,
          });
          chartMarkers.push({ kind: logged.class === "partial" ? "partial" : "full", born: overlayFrames });
          prependBlinkLogRow(
            sessionMetrics.events.length,
            logged.class,
            logged.durationMs,
            logged.closure,
            logged.depth,
          );
          updateCalibrationUi();
          renderPartialUi();
        } else {
          updateCalibrationUi();
          setText(hint, acquisitionPrompt());
          setCoach(true, acquisitionPrompt());
        }
      } else {
        updateCalibrationUi();
      }
    }
    frameRecorder.push({
      t: now,
      left: ears.left,
      right: ears.right,
      poseValid: bothEyes && frontal && !moving,
      faceValid: true,
      counted: snapshot.justBlinked,
    });
    if (snapshot.calibrated && !lastHintCalibrated) {
      lastHintCalibrated = true;
      setText(hint, isAcquiring() ? acquisitionPrompt() : countingHint());
    }
  } else {
    sessionMetrics.noteFrame(now, false, false);
    previousAnchor = null;
    detector.lostFace();
    frameRecorder.push({
      t: now,
      left: 0,
      right: 0,
      poseValid: false,
      faceValid: false,
      counted: false,
    });
  }

  timed("draw", () => drawStage(overlay, video, landmarks, leftClosed, rightClosed));
  if (landmarks) {
    partialTracker.update(detector.mean, detector.baseline, now, settings.partialCandidates);
    setText(partialCandidatesEl, String(partialTracker.count));
  }
  overlayFrames += 1;
  timed("draw", () =>
    drawEarChart(earChart, leftEar, rightEar, detector.closeThreshold, detector.avg, {
      markers: chartMarkers.map((marker) => ({ kind: marker.kind, age: overlayFrames - marker.born })),
      calibrating: isAcquiring(),
      showOpenness: settings.showOpenness,
      baseline: detector.baseline,
      closedRatio: scoredClosedRatio(),
      recovery: settings.recoveryLine ? detector.baseline * 0.85 : null,
      partialLine: settings.partialCandidates ? detector.baseline * 0.82 : null,
    }),
  );
  timed("dom", () => {
    renderBlinkCount();
    renderStats(
      faceFound,
      bothEyes,
      closed,
      tilted,
      moving,
      closed !== lastClosed ||
        faceFound !== lastFaceFound ||
        bothEyes !== lastBothEyes ||
        tilted !== lastTilted ||
        moving !== lastMoving,
    );
  });
  tickFps(now);
  if (PERF_ENABLED) {
    const track = stream?.getVideoTracks()[0]?.getSettings();
    maybeLogPerf(now, {
      delegate: modelDelegate,
      video: { width: track?.width, height: track?.height, frameRate: track?.frameRate },
    });
  }

  if (
    faceFound !== lastFaceFound ||
    bothEyes !== lastBothEyes ||
    tilted !== lastTilted ||
    moving !== lastMoving
  ) {
    lastFaceFound = faceFound;
    lastBothEyes = bothEyes;
    lastTilted = tilted;
    lastMoving = moving;
    if (!faceFound) {
      setCoach(false);
      setScrim(true, "No face in view. Center your eyes in the frame.");
    } else if (!bothEyes) {
      setScrim(false);
      setCoach(true, "Please sit so both eyes are visible. Counting starts only then.");
    } else if (moving) {
      setScrim(false);
      setCoach(true, "Hold still. Head motion is ignored so it is not counted as a blink.");
    } else if (tilted) {
      setScrim(false);
      setCoach(true, "Face the camera. Counting needs a frontal view of both eyes.");
    } else if (isAcquiring()) {
      setCoach(true, acquisitionPrompt());
      setScrim(false);
    } else {
      setCoach(false);
      setScrim(false);
    }
  }

  lastClosed = closed;
}

async function startAnalysis(): Promise<void> {
  if (running || startInFlight) return;
  startInFlight = true;
  startBtn.disabled = true;
  setShellState("starting");
  setScrim(true, "Starting camera...");
  setText(hint, "Allow camera access, then keep your face centered for calibration.");

  try {
    await ensureModel();
    stream = await startCamera(video, settings.fpsMode);
    detector.resetSession();
    applyStartLineToDetector();
    syncStrictDetector();
    frameRecorder.reset();
    resetAcquisition();
    overlayFrames = 0;
    lockedBaseline = 0;
    renderRejectedUi();
    clearScoredResults();
    updateCalibrationUi();
    setPausedTags(false);
    resetEarChart();
    lastBlinkCount = -1;
    lastHintCalibrated = false;
    lastFaceFound = null;
    lastBothEyes = null;
    lastTilted = null;
    lastMoving = null;
    lastClosed = null;
    previousAnchor = null;
    lastStatsAt = 0;
    lastScaleUiAt = 0;
    lastRateScale = null;
    lastPartialScale = null;
    updateScaleUi(performance.now(), true);
    analysisStartedAt = performance.now();
    lastProcessAt = 0;
    lastTimestamp = 0;
    lastVideoTime = -1;
    framesThisSecond = 0;
    fpsWindowStart = performance.now();
    running = true;
    setPausedTags(false);
    setLive(true);
    setCoach(false);
    setScrim(false);
    setShellState("calibrating");
    updateCalibrationUi();
    setPill(enginePill, modelDelegate ?? "GPU", "ok");
    setText(hint, "Look straight ahead with eyes open for ~1s so the open-eye baseline can lock.");
    lowFpsState = EMPTY_LOW_FPS;
    setLowFpsWarning(false, 0);
    resetPerf();
    scheduleNextFrame();
  } catch (error) {
    const message = cameraErrorMessage(error);
    setScrim(true, message);
    applyCameraError(message);
    setPill(enginePill, "Camera error", "warn");
    setText(hint, "Fix the camera issue, then start analysis again.");
    startBtn.disabled = false;
    startBtn.textContent = "Start";
    setLive(false);
  } finally {
    startInFlight = false;
  }
}

function stopAnalysis(): void {
  running = false;
  cancelAnimationFrame(rafId);
  if (canUseVideoFrameCallback && videoFrameHandle) {
    video.cancelVideoFrameCallback(videoFrameHandle);
  }
  videoFrameHandle = 0;
  rafId = 0;
  stopCamera(stream, video);
  stream = null;
  const ctx = overlay.getContext("2d");
  ctx?.clearRect(0, 0, overlay.width, overlay.height);
  setLive(false);
  startBtn.textContent = "Start";
  setScrim(true, "Camera off. Start analysis to begin tracking.");
  setShellState("paused");
  setPill(enginePill, modelDelegate ?? (landmarker ? "GPU" : "Engine idle"), landmarker ? "ok" : "");
  setPill(fpsPill, "0 fps", "");
  lowFpsState = EMPTY_LOW_FPS;
  setLowFpsWarning(false, 0);
  setText(faceStateEl, "Waiting");
  setText(eyeStateEl, "Idle");
  setText(leftEarEl, "—");
  setText(rightEarEl, "—");
  setText(earStatsEl, "—");
  setText(poseReadoutEl, "—");
  setText(thresholdEl, "0.30 / 0.21");
  setPausedTags(true);
  lastFaceFound = null;
  lastBothEyes = null;
  lastTilted = null;
  lastMoving = null;
  lastClosed = null;
  previousAnchor = null;
  setCoach(false);
  setText(hint, countingHint());
}

startBtn.addEventListener("click", () => {
  void startAnalysis();
});
stopBtn.addEventListener("click", stopAnalysis);
exportFramesBtn.addEventListener("click", () => {
  frameRecorder.download();
});
exportBlinksBtn.addEventListener("click", () => {
  sessionMetrics.download();
});
opennessToggle.addEventListener("change", persistSettings);
optPartial.addEventListener("change", persistSettings);
optRecovery.addEventListener("change", persistSettings);
optPitch.addEventListener("change", persistSettings);
optStrictEvents.addEventListener("change", persistSettings);
optStrictMin.addEventListener("change", persistSettings);
optStrictMax.addEventListener("change", persistSettings);
optWinkDip.addEventListener("change", persistSettings);
optWinkAsym.addEventListener("change", persistSettings);
optCustomStart.addEventListener("change", persistSettings);
optStart.addEventListener("change", persistSettings);
optFull.addEventListener("change", persistSettings);
optPoseLimit.addEventListener("change", persistSettings);
optFps.addEventListener("change", persistSettings);
optAdaptive.addEventListener("change", persistSettings);
optCalBlinks.addEventListener("change", persistSettings);
optRatePreset.addEventListener("change", () => {
  const preset: RatePresetName = optRatePreset.value === "screen" ? "screen" : "resting";
  const bounds = RATE_PRESETS[preset];
  optRateVeryLow.value = String(bounds.veryLow);
  optRateLow.value = String(bounds.low);
  optRateBelow.value = String(bounds.below);
  optRateGreenMax.value = String(bounds.greenMax);
  optRateAbove.value = String(bounds.above);
  optRateHigh.value = String(bounds.high);
  persistSettings();
});
optRateVeryLow.addEventListener("change", persistSettings);
optRateLow.addEventListener("change", persistSettings);
optRateBelow.addEventListener("change", persistSettings);
optRateGreenMax.addEventListener("change", persistSettings);
optRateAbove.addEventListener("change", persistSettings);
optRateHigh.addEventListener("change", persistSettings);
recalibrateBtn.addEventListener("click", () => {
  resetAcquisition();
  detector.resetCount();
  clearScoredResults();
  renderRejectedUi();
  analysisStartedAt = performance.now();
  lastStatsAt = 0;
  updateCalibrationUi();
  if (running) setShellState("calibrating");
  setText(hint, "Recalibrating. Blink fully at a natural pace. Scoring waits until calibration finishes.");
});
resetSettingsBtn.addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS, rateBounds: { ...DEFAULT_SETTINGS.rateBounds } };
  saveSettings(settings);
  applySettingsToForm();
  applyStartLineToDetector();
  syncStrictDetector();
  adaptiveCal.setTarget(settings.calibrationBlinks);
  syncAdaptiveDetector();
  updateCalibrationUi();
  layoutRateSegments();
  lastRateScale = null;
  lastPartialScale = null;
  updateScaleUi(performance.now(), true);
});
applySettingsToForm();
applyStartLineToDetector();
syncStrictDetector();
adaptiveCal.setTarget(settings.calibrationBlinks);
syncAdaptiveDetector();
updateCalibrationUi();
layoutRateSegments();
updateScaleUi(performance.now(), true);
renderRejectedUi();
resetBtn.addEventListener("click", () => {
  detector.resetCount();
  resetAcquisition();
  clearScoredResults();
  renderRejectedUi();
  analysisStartedAt = performance.now();
  lastStatsAt = 0;
  updateCalibrationUi();
  if (running) setShellState("calibrating");
  setPausedTags(!running);
  updateScaleUi(performance.now(), true);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden || !running) return;
  lastVideoTime = -1;
  lastProcessAt = 0;
});

window.addEventListener("pagehide", () => {
  if (running) stopAnalysis();
});

initShellUi();
setText(hint, countingHint());

void ensureModel().catch(() => {
  setPill(enginePill, "Model failed", "warn");
  setScrim(true, "Could not load the Face Landmarker model. Reload the page to try again.");
  startBtn.disabled = false;
  startBtn.textContent = "Retry model load";
});
