/**
 * Types for the body-scan step. Nothing here holds measurements: the scan
 * foundation only guides the user and reports what is actually detected.
 */

export type ScanPhaseId = 'front' | 'left' | 'back' | 'right';

/**
 * - `pending`: not reached yet
 * - `active`: the angle currently being guided
 * - `previewed`: guidance shown but NOT captured (no detection engine verified it)
 * - `captured`: a connected detection engine confirmed this angle
 */
export type ScanPhaseStatus = 'pending' | 'active' | 'previewed' | 'captured';

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
