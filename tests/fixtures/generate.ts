const DT = 1000 / 30;

function row(t: number, left: number, right: number, pose = true, face = true): string {
  return `${t.toFixed(3)},${left.toFixed(5)},${right.toFixed(5)},${pose ? 1 : 0},${face ? 1 : 0},0`;
}

function openHold(start: number, frames: number, ear = 0.31, dt = DT): { csv: string[]; t: number } {
  const csv: string[] = [];
  let t = start;
  for (let i = 0; i < frames; i += 1) {
    csv.push(row(t, ear, ear));
    t += dt;
  }
  return { csv, t };
}

function dip(start: number, trough: number, durationMs = 250, open = 0.31, dt = DT): { csv: string[]; t: number } {
  const csv: string[] = [];
  const steps = Math.max(8, Math.round(durationMs / dt));
  let t = start;
  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const shape = Math.sin(Math.PI * x);
    const ear = open - (open - trough) * shape;
    csv.push(row(t, ear, ear));
    t += dt;
  }
  return { csv, t };
}

function scaledFrames(framesAt30: number, dt: number): number {
  return Math.max(1, Math.round(framesAt30 * (DT / dt)));
}

export function syntheticFullBlinkAt(dt: number): string {
  const a = openHold(0, scaledFrames(24, dt), 0.31, dt);
  const b = dip(a.t, 0.07, 250, 0.31, dt);
  const c = openHold(b.t, scaledFrames(12, dt), 0.31, dt);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticTwoFullBlinksAt(dt: number): string {
  const a = openHold(0, scaledFrames(24, dt), 0.31, dt);
  const b = dip(a.t, 0.07, 250, 0.31, dt);
  const c = openHold(b.t, scaledFrames(18, dt), 0.31, dt);
  const d = dip(c.t, 0.07, 250, 0.31, dt);
  const e = openHold(d.t, scaledFrames(12, dt), 0.31, dt);
  return [header(), ...a.csv, ...b.csv, ...c.csv, ...d.csv, ...e.csv].join("\n");
}

export function syntheticPartialDipAt(dt: number): string {
  const a = openHold(0, scaledFrames(24, dt), 0.31, dt);
  const b = dip(a.t, 0.17, 250, 0.31, dt);
  const c = openHold(b.t, scaledFrames(12, dt), 0.31, dt);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticJitterOnlyAt(dt: number): string {
  const csv: string[] = [header()];
  let t = 0;
  const n = scaledFrames(90, dt);
  for (let i = 0; i < n; i += 1) {
    const jitter = 0.31 + (i % 2 === 0 ? 0.008 : -0.008);
    csv.push(row(t, jitter, jitter));
    t += dt;
  }
  return csv.join("\n");
}

function header(): string {
  return "timestamp_ms,left_ear,right_ear,pose_valid,face_valid,counted";
}

export function syntheticFullBlink(): string {
  const a = openHold(0, 24);
  const b = dip(a.t, 0.07, 250);
  const c = openHold(b.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticTwoFullBlinks(): string {
  const a = openHold(0, 24);
  const b = dip(a.t, 0.07, 250);
  const c = openHold(b.t, 18);
  const d = dip(c.t, 0.07, 250);
  const e = openHold(d.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv, ...d.csv, ...e.csv].join("\n");
}

export function syntheticPartialDip(): string {
  const a = openHold(0, 24);
  const b = dip(a.t, 0.17, 250);
  const c = openHold(b.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticJitterOnly(): string {
  const csv: string[] = [header()];
  let t = 0;
  for (let i = 0; i < 90; i += 1) {
    const jitter = 0.31 + (i % 2 === 0 ? 0.008 : -0.008);
    csv.push(row(t, jitter, jitter));
    t += DT;
  }
  return csv.join("\n");
}

export function syntheticOneEyeOnly(): string {
  const csv: string[] = [header()];
  let t = 0;
  for (let i = 0; i < 24; i += 1) {
    csv.push(row(t, 0.31, 0.31, false, true));
    t += DT;
  }
  const steps = Math.round(250 / DT);
  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const ear = 0.31 - (0.31 - 0.07) * Math.sin(Math.PI * x);
    csv.push(row(t, ear, 0.31, false, true));
    t += DT;
  }
  return csv.join("\n");
}

export function syntheticFullBlinkAfterHold(dt: number, holdMs: number): string {
  const a = openHold(0, Math.max(1, Math.round(holdMs / dt)), 0.31, dt);
  const b = dip(a.t, 0.07, 250, 0.31, dt);
  const c = openHold(b.t, scaledFrames(12, dt), 0.31, dt);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

/** Deterministic 33 +/- 4 ms timestamp jitter; EAR values unchanged. */
export function withTimestampJitter(csv: string, amplitude = 4): string {
  const offsets = [4, -4, 3, -3, 2, -2, 1, -1, 0, 4];
  const lines = csv.split(/\r?\n/);
  const out: string[] = [];
  let t = 0;
  let i = 0;
  for (const line of lines) {
    if (!line || line.startsWith("timestamp")) {
      out.push(line);
      continue;
    }
    const parts = line.split(",");
    if (i === 0) t = Number(parts[0]) || 0;
    else t += 33 + ((offsets[i % offsets.length] ?? 0) / 4) * amplitude;
    parts[0] = t.toFixed(3);
    out.push(parts.join(","));
    i += 1;
  }
  return out.join("\n");
}

export type PersonaSpec = {
  baseline: number;
  floor: number;
  noise?: number;
  nCal?: number;
  nTest?: number;
  jitterMs?: number;
};

export function syntheticPersona(spec: PersonaSpec): { csv: string; calUntil: number; testUntil: number } {
  const B = spec.baseline;
  const floor = spec.floor;
  const sigma = spec.noise ?? 0;
  const nCal = spec.nCal ?? 10;
  const nTest = spec.nTest ?? 20;
  const jitterMs = spec.jitterMs ?? 30_000;
  const csv: string[] = [header()];
  let t = 0;
  let i = 0;
  const push = (left: number, right: number) => {
    const n = sigma * Math.sin(i * 1.973);
    csv.push(row(t, left + n, right + n));
    t += DT;
    i += 1;
  };
  for (let f = 0; f < 36; f += 1) push(B, B);
  const blink = () => {
    const steps = Math.max(8, Math.round(250 / DT));
    for (let s = 0; s <= steps; s += 1) {
      const x = s / steps;
      const ear = B - (B - floor) * Math.sin(Math.PI * x);
      push(ear, ear);
    }
    for (let f = 0; f < 18; f += 1) push(B, B);
  };
  for (let b = 0; b < nCal; b += 1) blink();
  const calUntil = t;
  for (let b = 0; b < nTest; b += 1) blink();
  const testUntil = t;
  const jitterFrames = Math.round(jitterMs / DT);
  for (let f = 0; f < jitterFrames; f += 1) push(B, B);
  return { csv: csv.join("\n"), calUntil, testUntil };
}

export const PERSONA_BIG = { baseline: 0.38, floor: 0.09 };
export const PERSONA_SMALL = { baseline: 0.24, floor: 0.055 };
export const PERSONA_SHALLOW = { baseline: 0.3, floor: 0.3 * 0.6 };
export const PERSONA_NOISY = { baseline: 0.31, floor: 0.07, noise: 0.012 };

function dipAsym(
  start: number,
  leftTrough: number,
  rightTrough: number,
  durationMs = 250,
  open = 0.31,
  dt = DT,
): { csv: string[]; t: number } {
  const csv: string[] = [];
  const steps = Math.max(8, Math.round(durationMs / dt));
  let t = start;
  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const shape = Math.sin(Math.PI * x);
    csv.push(row(t, open - (open - leftTrough) * shape, open - (open - rightTrough) * shape));
    t += dt;
  }
  return { csv, t };
}

export function syntheticWink(): string {
  const a = openHold(0, 24);
  const b = dipAsym(a.t, 0.07, 0.31);
  const c = openHold(b.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticMildAsymmetry(): string {
  const a = openHold(0, 24);
  const b = dipAsym(a.t, 0.07, 0.12);
  const c = openHold(b.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticHeadTurnAsymmetry(): string {
  const a = openHold(0, 24);
  const b = dipAsym(a.t, 0.25, 0.10);
  const c = openHold(b.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

export function syntheticOneFrameSpike(): string {
  const a = openHold(0, 24);
  const csv = [...a.csv, row(a.t, 0.07, 0.07)];
  const c = openHold(a.t + DT, 12);
  return [header(), ...csv, ...c.csv].join("\n");
}

export function syntheticHeldClosed(closedMs: number): string {
  const a = openHold(0, 24);
  const dipMs = closedMs / 0.746;
  const b = dip(a.t, 0.07, dipMs);
  const c = openHold(b.t, 12);
  return [header(), ...a.csv, ...b.csv, ...c.csv].join("\n");
}

function holdClosed(start: number, frames: number, pose = true, face = true): { csv: string[]; t: number } {
  const csv: string[] = [];
  let t = start;
  for (let i = 0; i < frames; i += 1) {
    csv.push(row(t, 0.07, 0.07, pose, face));
    t += DT;
  }
  return { csv, t };
}

export function syntheticFaceLostMidBlink(): string {
  const a = openHold(0, 24);
  const closed = holdClosed(a.t, 8);
  const lost = holdClosed(closed.t, 5, true, false);
  const c = openHold(lost.t, 12);
  return [header(), ...a.csv, ...closed.csv, ...lost.csv, ...c.csv].join("\n");
}

export function syntheticPoseInvalidMidBlink(): string {
  const a = openHold(0, 24);
  const closed = holdClosed(a.t, 8);
  const bad = holdClosed(closed.t, 5, false, true);
  const c = openHold(bad.t, 12);
  return [header(), ...a.csv, ...closed.csv, ...bad.csv, ...c.csv].join("\n");
}

export function syntheticGapMidBlink(gapMs = 150): string {
  const a = openHold(0, 24);
  const closed = holdClosed(a.t, 8);
  const csv = [...closed.csv, row(closed.t + gapMs, 0.07, 0.07)];
  const c = openHold(closed.t + gapMs + DT, 12);
  return [header(), ...a.csv, ...csv, ...c.csv].join("\n");
}

export function syntheticHeadTilt(): string {
  const a = openHold(0, 24);
  const csv = [...a.csv];
  let t = a.t;
  const steps = Math.round(250 / DT);
  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const ear = 0.31 - (0.31 - 0.07) * Math.sin(Math.PI * x);
    csv.push(row(t, ear, ear, false, true));
    t += DT;
  }
  return [header(), ...csv].join("\n");
}
