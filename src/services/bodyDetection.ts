import type { ScanPhaseId } from '../types/scan';

/**
 * Contract for a future body/pose detection engine (e.g. an on-device pose
 * landmark model). The scan UI already reacts to these results, but no engine
 * is connected yet — see `bodyDetector` below.
 */

export type BodyDistance = 'too-close' | 'too-far' | 'ok';

export interface BodyDetectionResult {
  /** Whether a full body (head to feet) is inside the guide frame. */
  fullBodyInFrame: boolean;
  distance: BodyDistance;
  /** Detected orientation relative to the camera, or null if uncertain. */
  orientation: ScanPhaseId | null;
}

export interface BodyDetector {
  detect: (video: HTMLVideoElement) => Promise<BodyDetectionResult | null>;
}

/**
 * No body detection engine is connected in this version. While this is null,
 * the UI must not claim that a body, distance or angle was detected, and no
 * scan angle can be marked as captured.
 */
export const bodyDetector: BodyDetector | null = null;

export const isBodyDetectionAvailable = (): boolean => bodyDetector !== null;
