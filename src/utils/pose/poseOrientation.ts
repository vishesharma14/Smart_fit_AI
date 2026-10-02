import type { PoseLandmark } from '../../types/pose';
import type { ScanPhaseId } from '../../types/scan';
import { LM, clamp, mid, type Point } from './landmarks';

/*
 * Body orientation from pose landmarks.
 *
 * Phases are rotation states of one continuous turn to the user's left:
 *   front → turned left (side-on) → back → turned right (side-on).
 * All analysis uses the unmirrored camera image, where a person who has
 * turned to their left faces image-right, and one turned to their right
 * faces image-left.
 *
 * No single signal is reliable from every angle (the model is weakest from
 * behind and can swap left/right labels), so several independent signals
 * vote and the result is "uncertain" unless they agree clearly.
 */

/** Coarse view from the projected shoulder width alone. */
export type CoarseView = 'frontal' | 'side' | 'turning';

export interface OrientationEstimate {
  view: CoarseView;
  /** Detected scan angle, or null while turning / when the signals disagree. */
  orientation: ScanPhaseId | null;
  /** Projected shoulder width ÷ torso length (large when facing toward or away from the camera). */
  widthRatio: number;
  /** widthRatio relative to this person's frontal width ratio (≈1 frontal, ≈0 side-on). */
  relativeWidth: number;
  /** −1 (back to camera) … +1 (facing camera). Only meaningful for frontal views. */
  frontness: number;
  /** −1 (facing image-left, turned right) … +1 (facing image-right, turned left). Only meaningful side-on. */
  facing: number;
  /** Torso yaw from the model's 3D landmarks (0 front, +90 turned left, ±180 back, −90 turned right). */
  worldYawDeg: number;
  /** 0–1 agreement of the signals behind `orientation`. */
  confidence: number;
  /** Individual votes (−1…+1) behind frontness and facing, for debugging. */
  signals: Record<string, number>;
}

export interface OrientationCalibration {
  /** widthRatio measured when the front view was captured. */
  frontalWidthRatio: number;
}

/** Typical shoulder-width-to-torso ratio facing the camera, used until the front view calibrates it. */
export const DEFAULT_FRONTAL_WIDTH_RATIO = 0.65;

/** relativeWidth thresholds, with hysteresis toward the previous view so the result doesn't flicker. */
const FRONTAL_MIN = 0.7;
const FRONTAL_KEEP = 0.62;
const SIDE_MAX = 0.35;
const SIDE_KEEP = 0.42;

/** Combined vote needed to decide front vs back, or which way a side view faces. */
const DECISION_MIN = 0.25;
/**
 * Front view: the model's 3D torso yaw must also be within this many degrees
 * of facing the camera. (Not applied from behind, where the 3D estimate is
 * less dependable and a strict limit could stop the scan.)
 */
const FRONT_MAX_YAW_DEG = 35;

interface Vote {
  value: number;
  weight: number;
}

const combine = (votes: Vote[]): number => {
  const total = votes.reduce((sum, vote) => sum + vote.weight, 0);
  return total === 0 ? 0 : votes.reduce((sum, vote) => sum + vote.value * vote.weight, 0) / total;
};

const meanVisibility = (pose: PoseLandmark[], indices: readonly number[]): number =>
  indices.reduce((sum, index) => sum + pose[index].visibility, 0) / indices.length;

const FACE = [LM.nose, LM.leftEyeInner, LM.leftEye, LM.leftEyeOuter, LM.rightEyeInner, LM.rightEye, LM.rightEyeOuter, LM.mouthLeft, LM.mouthRight] as const;

/**
 * @param px     image landmarks in pixels (unmirrored)
 * @param pose   image landmarks as returned by the model (for visibility)
 * @param world  3D world landmarks in metres
 */
export function estimateOrientation(
  px: Point[],
  pose: PoseLandmark[],
  world: PoseLandmark[],
  calibration: OrientationCalibration | null,
  previousView: CoarseView | null,
): OrientationEstimate {
  const shoulderMid = mid(px[LM.leftShoulder], px[LM.rightShoulder]);
  const hipMid = mid(px[LM.leftHip], px[LM.rightHip]);
  const torso = Math.max(Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y), 1);

  const shoulderDx = px[LM.leftShoulder].x - px[LM.rightShoulder].x;
  const hipDx = px[LM.leftHip].x - px[LM.rightHip].x;
  const widthRatio = Math.abs(shoulderDx) / torso;
  const frontalRatio = calibration?.frontalWidthRatio ?? DEFAULT_FRONTAL_WIDTH_RATIO;
  const relativeWidth = widthRatio / frontalRatio;

  const frontalMin = previousView === 'frontal' ? FRONTAL_KEEP : FRONTAL_MIN;
  const sideMax = previousView === 'side' ? SIDE_KEEP : SIDE_MAX;
  const view: CoarseView = relativeWidth >= frontalMin ? 'frontal' : relativeWidth <= sideMax ? 'side' : 'turning';

  // 3D torso yaw: angle of the right→left shoulder (and hip) vector in the ground plane.
  const sx = world[LM.leftShoulder].x - world[LM.rightShoulder].x + 0.5 * (world[LM.leftHip].x - world[LM.rightHip].x);
  const sz = world[LM.leftShoulder].z - world[LM.rightShoulder].z + 0.5 * (world[LM.leftHip].z - world[LM.rightHip].z);
  const worldYawDeg = (Math.atan2(sz, sx) * 180) / Math.PI;
  const worldLength = Math.hypot(sx, sz) || 1;

  // Front vs back. Positive = facing the camera.
  const earMidWorld = mid(world[LM.leftEar], world[LM.rightEar]);
  const toeDepth =
    (world[LM.leftHeel].z - world[LM.leftFoot].z + (world[LM.rightHeel].z - world[LM.rightFoot].z)) / 2;
  const signals: Record<string, number> = {
    // Left/right labels in their natural order (the model can swap them from behind, so weighted lightly).
    shoulderOrder: clamp(shoulderDx / (0.3 * torso), -1, 1),
    hipOrder: clamp(hipDx / (0.15 * torso), -1, 1),
    // Face landmarks are only clearly visible from the front.
    face: clamp((meanVisibility(pose, FACE) - 0.6) / 0.3, -1, 1),
    // Toes closer to the camera than heels, and nose closer than the ears, when facing it.
    toeDepth: clamp(toeDepth / 0.08, -1, 1),
    noseDepth: clamp((earMidWorld.z - world[LM.nose].z) / 0.06, -1, 1),
    // The model's 3D torso direction: the most consistent single cue in testing, including from behind.
    worldFront: Math.cos((worldYawDeg * Math.PI) / 180),
  };
  const frontness = combine([
    { value: signals.shoulderOrder, weight: 0.75 },
    { value: signals.hipOrder, weight: 0.5 },
    { value: signals.face, weight: 1 },
    { value: signals.toeDepth, weight: 1 },
    { value: signals.noseDepth, weight: 1 },
    { value: signals.worldFront, weight: 2 },
  ]);

  // Side direction. Positive = nose and toes point image-right (turned left).
  const earMid = mid(px[LM.leftEar], px[LM.rightEar]);
  const toeDx = (px[LM.leftFoot].x - px[LM.leftHeel].x + (px[LM.rightFoot].x - px[LM.rightHeel].x)) / 2;
  signals.noseDirection = clamp((px[LM.nose].x - earMid.x) / (0.12 * torso), -1, 1);
  signals.toeDirection = clamp(toeDx / (0.12 * torso), -1, 1);
  signals.worldSide = clamp(sz / worldLength, -1, 1);
  const facing = combine([
    { value: signals.noseDirection, weight: 1 },
    { value: signals.toeDirection, weight: 1 },
    { value: signals.worldSide, weight: 0.75 },
  ]);

  let orientation: ScanPhaseId | null = null;
  let confidence = 0;
  if (view === 'frontal' && frontness >= DECISION_MIN && Math.abs(worldYawDeg) <= FRONT_MAX_YAW_DEG) {
    orientation = 'front';
    confidence = frontness;
  } else if (view === 'frontal' && frontness <= -DECISION_MIN) {
    orientation = 'back';
    confidence = -frontness;
  } else if (view === 'side' && Math.abs(facing) >= DECISION_MIN) {
    orientation = facing > 0 ? 'left' : 'right';
    confidence = Math.abs(facing);
  }

  return { view, orientation, widthRatio, relativeWidth, frontness, facing, worldYawDeg, confidence, signals };
}
