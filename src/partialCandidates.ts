/**
 * Optional shallow-dip counter. Independent of BlinkDetector.
 * Counts a dip that stays between 70% and 85% of baseline, never below the close line.
 */
export class PartialCandidateTracker {
  count = 0;
  private active = false;
  private frames = 0;
  private startedAt = 0;
  private lastAt = 0;

  reset(): void {
    this.count = 0;
    this.active = false;
    this.frames = 0;
    this.startedAt = 0;
    this.lastAt = 0;
  }

  update(mean: number, baseline: number, nowMs: number, enabled: boolean): boolean {
    if (!enabled || baseline <= 0) {
      this.active = false;
      return false;
    }
    const closeLine = baseline * 0.7;
    const shallowLine = baseline * 0.85;
    const inBand = mean < shallowLine && mean >= closeLine;
    if (!this.active && inBand) {
      this.active = true;
      this.frames = 1;
      this.startedAt = nowMs;
      return false;
    }
    if (this.active && inBand) {
      this.frames += 1;
      return false;
    }
    if (this.active && !inBand) {
      const duration = nowMs - this.startedAt;
      const counted =
        mean >= shallowLine &&
        this.frames >= 2 &&
        duration >= 50 &&
        duration <= 700 &&
        nowMs - this.lastAt >= 160;
      this.active = false;
      this.frames = 0;
      if (counted) {
        this.count += 1;
        this.lastAt = nowMs;
        return true;
      }
    }
    return false;
  }
}
