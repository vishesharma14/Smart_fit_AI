import type { PoseLandmark } from './pose';

/**
 * Types for the body-scan step. Nothing here holds measurements: the scan
 * guides the user and keeps only the pose landmarks the model actually detected.
 */

export type ScanPhaseId = 'front' | 'left' | 'back' | 'right';

/**
 * - `pending`: not reached yet
 * - `active`: the angle currently being guided
 * - `captured`: the pose model confirmed this angle and a landmark snapshot was taken
 */
export type ScanPhaseStatus = 'pending' | 'active' | 'captured';

/**
 * What is kept when an angle is captured: pose landmarks averaged over the
 * hold, never an image. Kept in memory on the scan page only.
 */
export interface ScanCapture {
  /** Angle this capture was validated for (always the angle that was active at the time). */
  phase: ScanPhaseId;
  capturedAt: number;
  /** Number of consecutive validated frames averaged into this capture. */
  sampleCount: number;
  /** How long the pose stayed continuously valid before capture, in ms. */
  holdMs: number;
  /** Image landmarks (0–1 of the unmirrored video frame). */
  landmarks: PoseLandmark[];
  /** 3D landmarks in metres from the hip centre, as estimated by the model. */
  worldLandmarks: PoseLandmark[];
  videoWidth: number;
  videoHeight: number;
  /** Body region that was validated for this capture. */
  scanRegion: 'full' | 'upper' | 'lower';
  /** Width ratio at capture (shoulders ÷ torso, or hips ÷ thigh for the lower body); the front view calibrates side detection. */
  widthRatio: number;
  /** Orientation agreement (0–1) at capture. */
  orientationConfidence: number;
}

/** Overall scan session state. */
export type ScanSessionStatus = 'ready' | 'scanning' | 'paused' | 'finished';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';

export type CameraErrorKind =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'not-found'
  | 'in-use'
  | 'ended'
  | 'unknown';

export type FacingMode = 'user' | 'environment';

/** Lighting assessment from average frame brightness. */
export type BrightnessLevel = 'too-dark' | 'too-bright' | 'ok';

/** Real-time frame quality measured from the live video on this device. */
export interface FrameQuality {
  brightness: BrightnessLevel;
  /** `true` when consecutive frames differ noticeably (the person or camera is moving). */
  moving: boolean;
}
