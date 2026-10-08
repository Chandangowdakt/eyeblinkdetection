export type Point = { x: number; y: number };

/** Soukupova & Cech 6-point eye model mapped onto MediaPipe Face Mesh. */
export const RIGHT_EYE = {
  p1: 33,
  p2: 160,
  p3: 158,
  p4: 133,
  p5: 153,
  p6: 144,
} as const;

export const LEFT_EYE = {
  p1: 362,
  p2: 385,
  p3: 387,
  p4: 263,
  p5: 373,
  p6: 380,
} as const;

export const RIGHT_EYE_CONNECTIONS: Array<[number, number]> = [
  [33, 160],
  [160, 158],
  [158, 133],
  [133, 153],
  [153, 144],
  [144, 33],
];

export const LEFT_EYE_CONNECTIONS: Array<[number, number]> = [
  [362, 385],
  [385, 387],
  [387, 263],
  [263, 373],
  [373, 380],
  [380, 362],
];

export const EYE_CONNECTIONS: Array<[number, number]> = [
  ...RIGHT_EYE_CONNECTIONS,
  ...LEFT_EYE_CONNECTIONS,
];

export const EYE_POINTS = [
  RIGHT_EYE.p1,
  RIGHT_EYE.p2,
  RIGHT_EYE.p3,
  RIGHT_EYE.p4,
  RIGHT_EYE.p5,
  RIGHT_EYE.p6,
  LEFT_EYE.p1,
  LEFT_EYE.p2,
  LEFT_EYE.p3,
  LEFT_EYE.p4,
  LEFT_EYE.p5,
  LEFT_EYE.p6,
];

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function eyeAspectRatio(landmarks: Point[], eye: typeof LEFT_EYE | typeof RIGHT_EYE): number {
  const p1 = landmarks[eye.p1];
  const p2 = landmarks[eye.p2];
  const p3 = landmarks[eye.p3];
  const p4 = landmarks[eye.p4];
  const p5 = landmarks[eye.p5];
  const p6 = landmarks[eye.p6];
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;

  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = dist(p1, p4);
  if (horizontal < 1e-6) return 0;
  return vertical / (2 * horizontal);
}

export function meanEar(landmarks: Point[]): { left: number; right: number; mean: number } {
  const left = eyeAspectRatio(landmarks, LEFT_EYE);
  const right = eyeAspectRatio(landmarks, RIGHT_EYE);
  return { left, right, mean: (left + right) / 2 };
}

function inFrame(point: Point | undefined, margin = 0.04): boolean {
  if (!point) return false;
  return point.x >= margin && point.x <= 1 - margin && point.y >= margin && point.y <= 1 - margin;
}

function eyeWidth(landmarks: Point[], eye: typeof LEFT_EYE | typeof RIGHT_EYE): number {
  const p1 = landmarks[eye.p1];
  const p4 = landmarks[eye.p4];
  if (!p1 || !p4) return 0;
  return dist(p1, p4);
}

/**
 * Both eyelids must be on-camera and similar in size.
 * Profile / one-eye-out-of-frame still gets a full mesh, so existence is not enough.
 */
export function bothEyesVisible(landmarks: Point[]): boolean {
  if (!EYE_POINTS.every((index) => inFrame(landmarks[index]))) return false;

  const left = eyeWidth(landmarks, LEFT_EYE);
  const right = eyeWidth(landmarks, RIGHT_EYE);
  const wider = Math.max(left, right);
  const narrower = Math.min(left, right);
  if (wider < 0.015 || narrower < 0.012) return false;
  if (narrower / wider < 0.58) return false;

  const outerLeft = landmarks[LEFT_EYE.p4];
  const outerRight = landmarks[RIGHT_EYE.p1];
  if (!outerLeft || !outerRight) return false;
  const iod = dist(outerLeft, outerRight);
  if (iod < wider * 1.35) return false;

  return true;
}

export type FaceAnchor = { x: number; y: number; iod: number };

export function faceAnchor(landmarks: Point[]): FaceAnchor | null {
  const nose = landmarks[1];
  const outerLeft = landmarks[LEFT_EYE.p4];
  const outerRight = landmarks[RIGHT_EYE.p1];
  if (!nose || !outerLeft || !outerRight) return null;
  return { x: nose.x, y: nose.y, iod: dist(outerLeft, outerRight) };
}

export function faceMoved(previous: FaceAnchor, current: FaceAnchor): boolean {
  const jump = Math.hypot(current.x - previous.x, current.y - previous.y);
  const iodChange = Math.abs(current.iod - previous.iod) / Math.max(current.iod, 1e-3);
  return jump > 0.05 || iodChange > 0.16;
}

/** Reject strong yaw so profile / turned faces cannot count a blink. */
export function isFrontalFace(landmarks: Point[]): boolean {
  const nose = landmarks[1];
  const outerLeft = landmarks[LEFT_EYE.p4];
  const outerRight = landmarks[RIGHT_EYE.p1];
  if (!nose || !outerLeft || !outerRight) return false;
  const iod = dist(outerLeft, outerRight);
  if (iod < 1e-3) return false;
  const midX = (outerLeft.x + outerRight.x) / 2;
  return Math.abs(nose.x - midX) / iod < 0.22;
}
