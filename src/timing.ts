export const FRAME_INTERVAL_30_MS = 1000 / 30;
export const VALLEY_FRAMES = 13;
export const WARMUP_FRAMES = 16;
export const VALLEY_MS = VALLEY_FRAMES * FRAME_INTERVAL_30_MS;
export const WARMUP_MS = WARMUP_FRAMES * FRAME_INTERVAL_30_MS;

export function framesFromMs(ms: number, intervalMs = FRAME_INTERVAL_30_MS): number {
  return Math.max(1, Math.round(ms / intervalMs));
}
