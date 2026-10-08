export const PERF_ENABLED =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("perf") === "1";

type Bucket = "infer" | "draw" | "dom";

const samples: Record<Bucket, number[]> = { infer: [], draw: [], dom: [] };
let rvfcTicks = 0;
let processedTicks = 0;
let lastLogAt = 0;

export function noteRvfcTick(): void {
  if (PERF_ENABLED) rvfcTicks += 1;
}

export function noteProcessedTick(): void {
  if (PERF_ENABLED) processedTicks += 1;
}

export function timed<T>(bucket: Bucket, fn: () => T): T {
  if (!PERF_ENABLED) return fn();
  const start = performance.now();
  const result = fn();
  samples[bucket].push(performance.now() - start);
  return result;
}

function meanOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function p95Of(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

export function maybeLogPerf(now: number, extra: Record<string, unknown>): void {
  if (!PERF_ENABLED) return;
  if (lastLogAt === 0) lastLogAt = now;
  if (now - lastLogAt < 5000) return;
  const elapsedSec = Math.max(0.001, (now - lastLogAt) / 1000);
  console.info("[blinksense perf]", {
    ...extra,
    rvfcHz: rvfcTicks / elapsedSec,
    processedFps: processedTicks / elapsedSec,
    inferMs: { mean: meanOf(samples.infer), p95: p95Of(samples.infer) },
    drawMs: meanOf(samples.draw),
    domMs: meanOf(samples.dom),
  });
  rvfcTicks = 0;
  processedTicks = 0;
  samples.infer.length = 0;
  samples.draw.length = 0;
  samples.dom.length = 0;
  lastLogAt = now;
}

export function resetPerf(): void {
  rvfcTicks = 0;
  processedTicks = 0;
  samples.infer.length = 0;
  samples.draw.length = 0;
  samples.dom.length = 0;
  lastLogAt = 0;
}
