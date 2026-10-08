export type HeadPose = { yaw: number; pitch: number; roll: number };

/** Column-major 4x4 facial transformation matrix from MediaPipe. */
export function poseFromMatrix(data: number[] | Float32Array | undefined): HeadPose | null {
  if (!data || data.length < 16) return null;
  const m8 = data[8] ?? 0;
  const m9 = data[9] ?? 0;
  const m10 = data[10] ?? 0;
  const m1 = data[1] ?? 0;
  const m5 = data[5] ?? 0;
  const yaw = (Math.atan2(m8, m10) * 180) / Math.PI;
  const pitch = (Math.atan2(-m9, Math.hypot(m8, m10)) * 180) / Math.PI;
  const roll = (Math.atan2(m1, m5) * 180) / Math.PI;
  return { yaw, pitch, roll };
}

export function formatPose(pose: HeadPose | null): string {
  if (!pose) return "—";
  return `y ${pose.yaw.toFixed(0)}° · p ${pose.pitch.toFixed(0)}° · r ${pose.roll.toFixed(0)}°`;
}
