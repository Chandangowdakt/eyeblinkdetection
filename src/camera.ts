export async function startCamera(video: HTMLVideoElement, fps: 30 | 60 = 30): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("Camera access requires localhost or HTTPS.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support webcam capture.");
  }

  const preferred: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: fps },
    },
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(preferred);
  } catch (error) {
    if (!isOverconstrained(error)) throw error;
    if (fps === 60) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        });
      } catch (retryError) {
        if (!isOverconstrained(retryError)) throw retryError;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
  }

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  video.disablePictureInPicture = true;
  await video.play();

  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onError = () => reject(new Error("The webcam stream failed to start."));
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }

  return stream;
}

export function stopCamera(stream: MediaStream | null, video: HTMLVideoElement): void {
  stream?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission was blocked. Allow the camera in the address bar, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is already in use by another application.";
    case "OverconstrainedError":
      return "This camera does not support the requested video settings.";
    case "SecurityError":
      return "Camera access requires localhost or HTTPS.";
    default:
      return error instanceof Error ? error.message : "Could not start the camera.";
  }
}

function isOverconstrained(error: unknown): boolean {
  return error instanceof DOMException && error.name === "OverconstrainedError";
}
