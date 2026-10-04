import type { PoseLandmark } from './pose';
import type { SilhouetteProfile } from './silhouette';

/**
 * Types for the body-scan step. Nothing here holds measurements: the scan
 * guides the user and keeps only the pose landmarks the model actually detected
 * and the outline numbers derived from its segmentation mask.
 */

/** The four cardinal views: facing the camera, turned left (side-on), back, turned right (side-on). */
export type ScanPhaseId = 'front' | 'left' | 'back' | 'right';

/**
 * Views of the guided 360° scan, by body angle (0° facing the camera, turning to the user's left):
 * front 0° · front-left 45° · left 90° · back-left 135° · back 180° · back-right 225° · right 270° · front-right 315°.
 * The angles are targets: a capture is accepted anywhere within its view's window and keeps its own measured angle.
 */
export type ScanViewId = ScanPhaseId | 'front-left' | 'back-left' | 'back-right' | 'front-right';

/**
 * What is kept when an angle is captured: pose landmarks averaged over the
 * hold and (when available) the body-outline profile, never an image or mask.
 * Kept in memory only.
 */
export interface ScanCapture {
  /** View this capture was accepted for. */
  phase: ScanViewId;
  /** Body angle estimated from the pose during the capture (median over its frames, degrees 0–360); absent on older captures. */
  yawDeg?: number;
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
  /**
   * Body outline (edge positions per row, median over the hold frames), when the segmentation mask was usable.
   * Numbers only — never the mask or an image. Its absence never prevents a capture.
   */
  silhouette?: SilhouetteProfile;
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
