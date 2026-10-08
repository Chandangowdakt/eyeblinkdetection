import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

const WASM_URL = `${typeof location !== "undefined" ? location.origin : ""}/wasm`;
const MODEL_URL = "/models/face_landmarker.task";

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

function loadFileset() {
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_URL);
  return filesetPromise;
}

async function createLandmarker(delegate: "GPU" | "CPU"): Promise<FaceLandmarker> {
  const vision = await loadFileset();
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });
}

export async function createFaceLandmarker(): Promise<{ landmarker: FaceLandmarker; delegate: "GPU" | "CPU" }> {
  try {
    const landmarker = await createLandmarker("GPU");
    return { landmarker, delegate: "GPU" };
  } catch {
    const landmarker = await createLandmarker("CPU");
    return { landmarker, delegate: "CPU" };
  }
}

export function detectFace(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): FaceLandmarkerResult {
  return landmarker.detectForVideo(video, timestampMs);
}
