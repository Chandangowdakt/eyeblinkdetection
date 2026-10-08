import { BlinkDetector } from "./blinkDetector";
import type { RejectedEvent, RejectionCounts } from "./eventValidation";

export type ReplayRow = {
  t: number;
  left: number;
  right: number;
  poseValid: boolean;
  faceValid: boolean;
};

export type ReplayResult = {
  count: number;
  countedFlags: boolean[];
  rejections: RejectionCounts;
  rejectedEvents: readonly RejectedEvent[];
};

/**
 * Feeds EAR samples through the live BlinkDetector with current defaults.
 * poseValid means the frame is eligible for counting (both eyes, frontal, still).
 */
export function replayRows(
  rows: ReplayRow[],
  configure?: (detector: BlinkDetector) => void,
): ReplayResult {
  const detector = new BlinkDetector();
  detector.resetSession();
  configure?.(detector);
  const countedFlags: boolean[] = [];
  let previous = 0;

  for (const row of rows) {
    const before = detector.blinkCount;
    if (!row.faceValid) {
      detector.observe(row.left, row.right);
      detector.noteInvalidFrame("faceLost", row.t);
    } else if (!row.poseValid) {
      detector.observe(row.left, row.right);
      detector.noteInvalidFrame("poseInvalid", row.t);
    } else {
      detector.update(row.left, row.right, row.t, false, true);
    }
    countedFlags.push(detector.blinkCount > before);
    previous = detector.blinkCount;
  }

  void previous;
  return {
    count: detector.blinkCount,
    countedFlags,
    rejections: detector.rejections,
    rejectedEvents: detector.rejectedEvents,
  };
}

export function parseFrameCsv(text: string): ReplayRow[] {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.length > 0);
  const start = lines[0]?.startsWith("timestamp") ? 1 : 0;
  const rows: ReplayRow[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const parts = lines[i]!.split(",");
    rows.push({
      t: Number(parts[0]),
      left: Number(parts[1]),
      right: Number(parts[2]),
      poseValid: parts[3] === "1" || parts[3] === "true",
      faceValid: parts[4] === "1" || parts[4] === "true",
    });
  }
  return rows;
}
