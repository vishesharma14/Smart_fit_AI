import type { PoseLandmark } from '../../types/pose';

/** MediaPipe Pose landmark indices. "Left"/"right" are the person's own left and right. */
export const LM = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

/** Bone connections drawn by the debug overlay. */
export const POSE_BONES: ReadonlyArray<readonly [number, number]> = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftHeel, LM.leftFoot],
  [LM.leftAnkle, LM.leftFoot],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightHeel, LM.rightFoot],
  [LM.rightAnkle, LM.rightFoot],
  [LM.leftEar, LM.leftEye],
  [LM.leftEye, LM.nose],
  [LM.nose, LM.rightEye],
  [LM.rightEye, LM.rightEar],
];

export interface Point {
  x: number;
  y: number;
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const mid = <T extends Point & { z?: number }>(a: T, b: T): { x: number; y: number; z: number } => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
});

/** Image landmarks (0–1) to pixels, so horizontal and vertical distances are comparable. */
export const toPixels = (pose: PoseLandmark[], width: number, height: number): Point[] =>
  pose.map((point) => ({ x: point.x * width, y: point.y * height }));

/** Part of the video frame the user actually sees, in 0–1 frame coordinates. */
export interface VisibleRegion {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * The preview uses `object-fit: cover`, so a frame whose shape differs from
 * the preview is cropped on two sides. Validation uses only the visible part,
 * so "in frame" means in the frame the user can see.
 */
export function visibleRegion(videoWidth: number, videoHeight: number, viewWidth: number, viewHeight: number): VisibleRegion {
  if (!videoWidth || !videoHeight || !viewWidth || !viewHeight) return { x0: 0, x1: 1, y0: 0, y1: 1 };
  const videoAspect = videoWidth / videoHeight;
  const viewAspect = viewWidth / viewHeight;
  if (videoAspect > viewAspect) {
    const share = viewAspect / videoAspect;
    return { x0: (1 - share) / 2, x1: (1 + share) / 2, y0: 0, y1: 1 };
  }
  const share = videoAspect / viewAspect;
  return { x0: 0, x1: 1, y0: (1 - share) / 2, y1: (1 + share) / 2 };
}
