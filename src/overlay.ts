import { LEFT_EYE, LEFT_EYE_CONNECTIONS, RIGHT_EYE, RIGHT_EYE_CONNECTIONS, type Point } from "./ear";

const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

function getCtx(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D | null {
  let ctx = contexts.get(canvas);
  if (!ctx) {
    ctx = canvas.getContext("2d", options) ?? undefined;
    if (!ctx) return null;
    contexts.set(canvas, ctx);
  }
  return ctx;
}

export function resizeOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/**
 * Paint the camera into the canvas (software pixels) so screen recorders
 * capture the feed. GPU-composited <video> layers often record as black.
 */
export function drawStage(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: Point[] | null,
  leftClosed: boolean,
  rightClosed: boolean,
): void {
  const ctx = getCtx(canvas, { alpha: false });
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    ctx.drawImage(video, 0, 0, width, height);
  } else {
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, width, height);
  }

  if (landmarks) {
    drawOneEye(ctx, landmarks, LEFT_EYE_CONNECTIONS, Object.values(LEFT_EYE), width, height, leftClosed ? "#ff6b7a" : "#3ee0c2");
    drawOneEye(ctx, landmarks, RIGHT_EYE_CONNECTIONS, Object.values(RIGHT_EYE), width, height, rightClosed ? "#ff6b7a" : "#f5a524");
  }

  ctx.restore();
}

function drawOneEye(
  ctx: CanvasRenderingContext2D,
  landmarks: Point[],
  connections: Array<[number, number]>,
  points: number[],
  width: number,
  height: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, width / 280);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  for (const [a, b] of connections) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
  }
  ctx.stroke();

  const radius = Math.max(2.2, width / 220);
  for (const index of points) {
    const point = landmarks[index];
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const CHART_HISTORY = 300;
export const CHART_WINDOW_LABEL = "last 10 s";

const leftHistory = new Float32Array(CHART_HISTORY);
const rightHistory = new Float32Array(CHART_HISTORY);
let earCount = 0;
let earWrite = 0;
let chartSizeKey = "";

export type ChartMarkerKind = "full" | "partial";

export function chartMarkerShape(kind: ChartMarkerKind): "triangle" | "diamond" {
  return kind === "full" ? "triangle" : "diamond";
}

export function chartMarkerIndex(age: number, sampleCount: number): number | null {
  const idx = sampleCount - 1 - age;
  if (idx < 0 || idx >= sampleCount) return null;
  return idx;
}

export function chartSampleX(index: number, sampleCount: number, history: number, width: number): number {
  const offset = history - sampleCount;
  return ((offset + index) / Math.max(1, history - 1)) * width;
}

export type ChartExtras = {
  markers?: Array<{ kind: ChartMarkerKind; age: number }>;
  calibrating?: boolean;
  showOpenness?: boolean;
  baseline?: number;
  closedRatio?: number;
  recovery?: number | null;
  partialLine?: number | null;
};

export function drawEarChart(
  canvas: HTMLCanvasElement,
  left: number | null,
  right: number | null,
  threshold: number,
  avg: number,
  extras: ChartExtras = {},
): void {
  const ctx = getCtx(canvas, { alpha: true });
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 280;
  const cssHeight = canvas.clientHeight || 120;
  const nextKey = `${cssWidth}x${cssHeight}@${dpr}`;
  if (chartSizeKey !== nextKey) {
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    chartSizeKey = nextKey;
  }

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (left != null && right != null) {
    leftHistory[earWrite] = left;
    rightHistory[earWrite] = right;
    earWrite = (earWrite + 1) % CHART_HISTORY;
    if (earCount < CHART_HISTORY) earCount += 1;
  }

  const plotLeft = 36;
  const plotBottom = 18;
  const plotW = Math.max(8, cssWidth - plotLeft - 8);
  const plotH = Math.max(8, cssHeight - plotBottom - 6);

  ctx.fillStyle = "#c5d0e0";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(CHART_WINDOW_LABEL, cssWidth - 8, cssHeight - 8);

  if (earCount < 2) return;

  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < earCount; i += 1) {
    const l = leftHistory[sampleIndex(i)];
    const r = rightHistory[sampleIndex(i)];
    lo = Math.min(lo, l, r, threshold);
    hi = Math.max(hi, l, r, threshold, avg || 0);
  }
  const pad = Math.max(0.025, (hi - lo) * 0.18);
  const minY = Math.max(0.02, lo - pad);
  const maxY = Math.min(0.7, hi + pad);

  const toY = (value: number) => {
    const t = (value - minY) / Math.max(0.04, maxY - minY);
    return 6 + (1 - Math.min(1, Math.max(0, t))) * plotH;
  };

  const ticks = [minY, (minY + maxY) / 2, maxY];
  ctx.fillStyle = "#c5d0e0";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of ticks) {
    ctx.fillText(tick.toFixed(2), plotLeft - 6, toY(tick));
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(plotLeft, 4, plotW, plotH + 4);
  ctx.clip();

  ctx.fillStyle = "rgba(62, 224, 194, 0.08)";
  ctx.beginPath();
  for (let i = 0; i < earCount; i += 1) {
    const x = plotLeft + chartSampleX(i, earCount, CHART_HISTORY, plotW);
    const y = toY(Math.max(leftHistory[sampleIndex(i)], rightHistory[sampleIndex(i)]));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = earCount - 1; i >= 0; i -= 1) {
    const x = plotLeft + chartSampleX(i, earCount, CHART_HISTORY, plotW);
    ctx.lineTo(x, toY(Math.min(leftHistory[sampleIndex(i)], rightHistory[sampleIndex(i)])));
  }
  ctx.closePath();
  ctx.fill();

  if (extras.calibrating) {
    ctx.fillStyle = "rgba(255, 184, 107, 0.08)";
    ctx.fillRect(plotLeft, 4, plotW, plotH + 4);
  }

  const mapY = extras.showOpenness && extras.baseline
    ? (value: number) => {
        const r = extras.closedRatio ?? 0.23;
        const open = (value / extras.baseline! - r) / Math.max(1e-6, 1 - r);
        return toY(Math.min(0.7, Math.max(0.02, 0.02 + open * 0.5)));
      }
    : toY;

  strokeGuide(ctx, plotLeft, plotW, mapY(threshold), "rgba(255, 107, 122, 0.7)", [4, 3]);
  if (avg > 0) strokeGuide(ctx, plotLeft, plotW, mapY(avg), "rgba(168, 180, 200, 0.7)", [2, 4]);
  if (extras.recovery != null) strokeGuide(ctx, plotLeft, plotW, mapY(extras.recovery), "rgba(148, 163, 255, 0.7)", [6, 3]);
  if (extras.partialLine != null) strokeGuide(ctx, plotLeft, plotW, mapY(extras.partialLine), "rgba(245, 165, 36, 0.7)", [2, 2]);

  strokeSeries(ctx, plotLeft, plotW, earCount, mapY, leftHistory, "#3ee0c2");
  ctx.save();
  ctx.setLineDash([5, 3]);
  strokeSeries(ctx, plotLeft, plotW, earCount, mapY, rightHistory, "#f5a524");
  ctx.restore();

  const markers = extras.markers ?? [];
  for (const marker of markers) {
    const idx = chartMarkerIndex(marker.age, earCount);
    if (idx == null) continue;
    const x = plotLeft + chartSampleX(idx, earCount, CHART_HISTORY, plotW);
    const y = mapY((leftHistory[sampleIndex(idx)] + rightHistory[sampleIndex(idx)]) / 2);
    ctx.fillStyle = marker.kind === "full" ? "#3ee0c2" : "#c4a0ff";
    ctx.strokeStyle = "#070b14";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (chartMarkerShape(marker.kind) === "triangle") {
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 6, y + 5);
      ctx.lineTo(x - 6, y + 5);
    } else {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function sampleIndex(i: number): number {
  const start = earCount === CHART_HISTORY ? earWrite : 0;
  return (start + i) % CHART_HISTORY;
}

function strokeGuide(
  ctx: CanvasRenderingContext2D,
  left: number,
  width: number,
  y: number,
  color: string,
  dash: number[],
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(left + width, y);
  ctx.stroke();
  ctx.restore();
}

function strokeSeries(
  ctx: CanvasRenderingContext2D,
  left: number,
  width: number,
  count: number,
  toY: (value: number) => number,
  series: Float32Array,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const x = left + chartSampleX(i, count, CHART_HISTORY, width);
    const y = toY(series[sampleIndex(i)]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function resetEarChart(): void {
  earCount = 0;
  earWrite = 0;
}
