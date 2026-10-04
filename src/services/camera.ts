import type { CameraErrorKind, FacingMode } from '../types/scan';

/** Why the camera cannot be used before even asking (null when it can be requested). */
export function cameraUnavailableReason(): CameraErrorKind | null {
  if (typeof window === 'undefined') return 'unsupported';
  // Browsers only expose getUserMedia on HTTPS or localhost.
  if (!window.isSecureContext) return 'insecure-context';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

/**
 * Requests a video-only stream. Audio is never requested.
 *
 * Full-body framing is limited by the camera's vertical field of view, and
 * many cameras produce 16:9 by cropping the top and bottom of their sensor.
 * Asking for 4:3 keeps the sensor's full height: a 4:3 mode is used when the
 * camera has one, otherwise the browser trims the sides (which the portrait
 * preview trims anyway). 960×720 has fewer pixels than 1280×720, keeping pose
 * inference fast: larger frames slowed it markedly in testing, and the pose
 * model works on a much smaller image anyway. 30 fps is plenty for ~10 pose
 * checks a second and avoids decoding 60 fps on phones. All values are
 * `ideal`, so every camera still works.
 *
 * If the requested camera (e.g. the rear camera) can't be opened, any
 * available camera is used instead.
 */
export async function requestCameraStream(facingMode: FacingMode): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    aspectRatio: { ideal: 4 / 3 },
    width: { ideal: 960 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...video, facingMode: { ideal: facingMode } } });
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : '';
    if (name !== 'OverconstrainedError' && name !== 'NotFoundError' && name !== 'NotReadableError') throw error;
    return navigator.mediaDevices.getUserMedia({ audio: false, video });
  }
}

/**
 * Phones and tablets (touch as the primary input, screen up to tablet size)
 * start with the rear camera, which usually has a wider, sharper view for
 * scanning a body; laptops and desktops start with their (front) webcam. The
 * user can switch either way, and a device without a rear camera simply gets
 * its front camera.
 */
export function preferredFacingMode(): FacingMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'user';
  const touchPrimary = window.matchMedia('(pointer: coarse)').matches;
  const handheldScreen = Math.min(window.screen.width, window.screen.height) < 1100;
  return touchPrimary && handheldScreen ? 'environment' : 'user';
}

/** Zoom support reported by the camera (Image Capture extensions; absent on many cameras and browsers). */
export interface CameraZoom {
  supported: boolean;
  min?: number;
  max?: number;
  /** Zoom in use after setup, if reported. */
  value?: number;
}

type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number } };
type ZoomSettings = MediaTrackSettings & { zoom?: number };

/**
 * If the camera exposes zoom control, sets it to the minimum (widest real
 * view). Does nothing when zoom isn't exposed — never assumes support, and
 * never simulates a wider view.
 */
export async function applyWidestZoom(track: MediaStreamTrack): Promise<CameraZoom> {
  const range = (track.getCapabilities?.() as ZoomCapabilities | undefined)?.zoom;
  if (!range || typeof range.min !== 'number') return { supported: false };
  const current = (track.getSettings() as ZoomSettings).zoom;
  if (current === undefined || current > range.min) {
    try {
      await track.applyConstraints({ advanced: [{ zoom: range.min } as MediaTrackConstraintSet] });
    } catch {
      // Keep the camera's current zoom if it refuses the change.
    }
  }
  return { supported: true, min: range.min, max: range.max, value: (track.getSettings() as ZoomSettings).zoom };
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
