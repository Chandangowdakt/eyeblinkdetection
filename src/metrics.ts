import { formatPartialHeadline, formatPartialSession, formatPartialWindow } from "./format";
import type { BlinkEvent, EarSample } from "./blinkDetector";
import {
  classifyBlinkEvent,
  classifyTrough,
  timeBelowCloseLine,
  troughOfMeanEar,
  type BlinkClass,
  type BlinkClassV2,
  type ClassifiedBlink,
} from "./classifier";

export type ClassifyExtras = {
  history?: readonly EarSample[];
  closeLine?: number;
  uncalibrated?: boolean;
  r?: number;
  baselineOnset?: number;
};

export type LoggedBlink = BlinkEvent &
  ClassifiedBlink & {
    depth: number;
    class: BlinkClass | BlinkClassV2;
    validMsAt: number;
  };

export class SessionMetrics {
  private readonly log: LoggedBlink[] = [];
  private validMs = 0;
  private prevNow = 0;
  private prevOk = false;

  reset(nowMs = 0): void {
    this.log.length = 0;
    void nowMs;
    this.validMs = 0;
    this.prevNow = 0;
    this.prevOk = false;
  }

  noteFrame(nowMs: number, faceValid: boolean, poseValid: boolean): void {
    const ok = faceValid && poseValid;
    if (this.prevNow > 0 && nowMs > this.prevNow) {
      const dt = Math.min(nowMs - this.prevNow, 250);
      if (this.prevOk && dt > 0) this.validMs += dt;
    }
    this.prevNow = nowMs;
    this.prevOk = ok;
  }

  get validTimeMs(): number {
    return this.validMs;
  }

  add(event: BlinkEvent, closedRatio: number, fullThreshold = 0.8, extras?: ClassifyExtras): LoggedBlink {
    const depth = event.baseline > 0 ? 1 - event.meanMin / event.baseline : 0;
    const classified = extras
      ? classifyFromExtras(event, closedRatio, fullThreshold, extras)
      : fallbackClassify(event, closedRatio, fullThreshold);
    const entry: LoggedBlink = {
      ...event,
      ...classified,
      depth,
      validMsAt: this.validMs,
    };
    this.log.push(entry);
    return entry;
  }

  get events(): readonly LoggedBlink[] {
    return this.log;
  }

  rollingRate(nowMs: number): string {
    const value = this.rollingRatePerMin(nowMs);
    if (value == null) return "—";
    return `${value.toFixed(1)} / min (60s)`;
  }

  rollingRatePerMin(nowMs?: number): number | null {
    void nowMs;
    if (this.validMs < 30_000) return null;
    const windowMs = Math.min(this.validMs, 60_000);
    const recent = this.inWindow().length;
    return (recent / windowMs) * 60_000;
  }

  partialPercent(): number | null {
    if (this.partialSampleState() !== "ok") return null;
    const window = this.inWindow();
    const full = window.filter((event) => event.class === "full").length;
    const partial = window.filter((event) => event.class === "partial").length;
    const m = full + partial;
    if (m < 5) return null;
    return (partial / m) * 100;
  }

  windowPartialCounts(): { partial: number; full: number; unsure: number; m: number } {
    return countsOf(this.inWindow());
  }

  sessionPartialCounts(): { partial: number; full: number; unsure: number; m: number } {
    return countsOf(this.log);
  }

  partialLabel(nowMs?: number): string {
    void nowMs;
    const window = this.windowPartialCounts();
    const session = this.sessionPartialCounts();
    return `${formatPartialHeadline(this.partialPercent())} · ${formatPartialWindow(window.partial, window.m, window.unsure)} · ${formatPartialSession(session.partial, session.m)}`;
  }

  partialSampleState(): "empty" | "low" | "ok" {
    const window = this.inWindow();
    const m = window.filter((event) => event.class === "full" || event.class === "partial").length;
    if (m <= 0) return "empty";
    if (m < 5) return "low";
    return "ok";
  }

  sessionPartial(): string {
    const session = this.sessionPartialCounts();
    return formatPartialSession(session.partial, session.m);
  }

  toCsv(): string {
    const header =
      "start_ms,duration_ms,left_min,right_min,mean_min,depth,class,baseline,O_min,closure,lowConfidence,perEyeMinL,perEyeMinR,asymmetry,uncalibrated";
    const body = this.log.map((event) =>
      [
        event.startMs.toFixed(3),
        event.durationMs.toFixed(3),
        event.leftMin.toFixed(5),
        event.rightMin.toFixed(5),
        event.meanMin.toFixed(5),
        event.depth.toFixed(4),
        event.class,
        event.baseline.toFixed(5),
        event.O_min.toFixed(4),
        event.closure.toFixed(4),
        event.lowConfidence ? "1" : "0",
        event.perEyeMinL.toFixed(5),
        event.perEyeMinR.toFixed(5),
        event.asymmetry.toFixed(4),
        event.uncalibrated ? "1" : "0",
      ].join(","),
    );
    return [header, ...body].join("\n");
  }

  download(filename = `blinksense-blinks-${Date.now()}.csv`): void {
    const blob = new Blob([this.toCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private inWindow(): LoggedBlink[] {
    const startValid = this.validMs - 60_000;
    return this.log.filter((event) => event.validMsAt >= startValid);
  }
}

function countsOf(events: readonly LoggedBlink[]): { partial: number; full: number; unsure: number; m: number } {
  const full = events.filter((event) => event.class === "full").length;
  const partial = events.filter((event) => event.class === "partial").length;
  const unsure = events.filter((event) => event.class === "unsure" || event.lowConfidence).length;
  return { partial, full, unsure, m: full + partial };
}

function fallbackClassify(event: BlinkEvent, closedRatio: number, fullThreshold: number): ClassifiedBlink {
  const O_min = Math.min(1, Math.max(0, event.baseline > 0 ? event.meanMin / event.baseline : 0));
  const klass = classifyTrough(event.meanMin, event.baseline, closedRatio, fullThreshold);
  return {
    O_min,
    closure: 1 - O_min,
    class: klass === "none" ? "partial" : klass,
    lowConfidence: false,
    perEyeMinL: event.leftMin,
    perEyeMinR: event.rightMin,
    asymmetry: event.baseline > 0 ? Math.abs(event.leftMin - event.rightMin) / event.baseline : 0,
    uncalibrated: true,
  };
}

function classifyFromExtras(
  event: BlinkEvent,
  closedRatio: number,
  fullThreshold: number,
  extras: ClassifyExtras,
): ClassifiedBlink {
  const history = extras.history ?? [];
  const trough = troughOfMeanEar(history, event.startMs, event.endMs);
  const below = extras.closeLine == null ? Number.POSITIVE_INFINITY : timeBelowCloseLine(history, event.startMs, event.endMs, extras.closeLine);
  return classifyBlinkEvent({
    troughEar: trough?.ear ?? event.meanMin,
    baselineOnset: extras.baselineOnset ?? event.baseline,
    r: extras.r ?? closedRatio,
    uncalibrated: extras.uncalibrated ?? true,
    fullBlinkClosure: fullThreshold,
    leftMin: event.leftMin,
    rightMin: event.rightMin,
    troughLeft: trough?.left,
    troughRight: trough?.right,
    msBelowClose: extras.closeLine == null ? Number.POSITIVE_INFINITY : below,
  });
}
