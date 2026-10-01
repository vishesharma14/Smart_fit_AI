import type { CameraErrorKind, FacingMode } from '../types/scan';

/** Why the camera cannot be used before even asking (null when it can be requested). */
export function cameraUnavailableReason(): CameraErrorKind | null {
  if (typeof window === 'undefined') return 'unsupported';
  // Browsers only expose getUserMedia on HTTPS or localhost.
  if (!window.isSecureContext) return 'insecure-context';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

/** Requests a video-only stream. Audio is never requested. */
export function requestCameraStream(facingMode: FacingMode): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

/** Stops every track so the camera light turns off. */
export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Number of cameras the browser reports (labels are not read). */
export async function countVideoInputs(): Promise<number> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput').length;
  } catch {
    return 0;
  }
}

/** Maps getUserMedia errors to the cases the UI explains. */
export function toCameraErrorKind(error: unknown): CameraErrorKind {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'unknown';
  }
}
