import type { PoseLandmark } from '../../types/pose';
import type { ScanCapture, ScanPhaseId } from '../../types/scan';
import { LM } from '../pose/landmarks';

/*
 * Test-only fixtures: a synthetic upright pose with known joint geometry
 * (world units), so expected lengths can be worked out by hand. Never used
 * by the app.
 *
 *   shoulder width 0.40 · torso 0.45 · arm 0.30 + 0.25 = 0.55 · leg 0.42 + 0.42 = 0.84
 *   stature: head top (0.7 neck above the ears) → heels = 0.739 + 0.88 = 1.619
 */

type Joints = Partial<Record<number, [number, number, number]>>;

export const STANDING_JOINTS: Joints = {
  [LM.nose]: [0, -0.6, -0.08],
  [LM.leftEar]: [0.07, -0.62, 0],
  [LM.rightEar]: [-0.07, -0.62, 0],
  [LM.leftShoulder]: [0.2, -0.45, 0],
  [LM.rightShoulder]: [-0.2, -0.45, 0],
  [LM.leftElbow]: [0.2, -0.15, 0],
  [LM.rightElbow]: [-0.2, -0.15, 0],
  [LM.leftWrist]: [0.2, 0.1, 0],
  [LM.rightWrist]: [-0.2, 0.1, 0],
  [LM.leftHip]: [0.1, 0, 0],
  [LM.rightHip]: [-0.1, 0, 0],
  [LM.leftKnee]: [0.1, 0.42, 0],
  [LM.rightKnee]: [-0.1, 0.42, 0],
  [LM.leftAnkle]: [0.1, 0.84, 0],
  [LM.rightAnkle]: [-0.1, 0.84, 0],
  [LM.leftHeel]: [0.1, 0.88, 0.03],
  [LM.rightHeel]: [-0.1, 0.88, 0.03],
  [LM.leftFoot]: [0.1, 0.88, -0.1],
  [LM.rightFoot]: [-0.1, 0.88, -0.1],
};

export const STANDING_STATURE = 0.739 + 0.88;

/** 33 landmarks from the joint table (unlisted points at the origin), all with `visibility`. */
export function makeLandmarks(joints: Joints = STANDING_JOINTS, visibility = 0.95, scale = 1): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, i) => {
    const [x, y, z] = joints[i] ?? [0, 0, 0];
    return { x: x * scale, y: y * scale, z: z * scale, visibility };
  });
}

/** Rotates landmarks about the vertical axis (a turned body: lengths are unchanged). */
export function rotateY(landmarks: PoseLandmark[], degrees: number): PoseLandmark[] {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return landmarks.map((p) => ({ ...p, x: p.x * cos + p.z * sin, z: -p.x * sin + p.z * cos }));
}

/** Sets the visibility of some landmarks (e.g. hidden by the body in a side view). */
export function withVisibility(landmarks: PoseLandmark[], indices: number[], visibility: number): PoseLandmark[] {
  return landmarks.map((p, i) => (indices.includes(i) ? { ...p, visibility } : p));
}

const PHASE_ROTATION: Record<ScanPhaseId, number> = { front: 0, left: 90, back: 180, right: 270 };

export function makeCapture(
  phase: ScanPhaseId,
  overrides: Partial<ScanCapture> & { scale?: number; visibility?: number } = {},
): ScanCapture {
  const { scale = 1, visibility = 0.95, ...rest } = overrides;
  const world = rotateY(makeLandmarks(STANDING_JOINTS, visibility, scale), PHASE_ROTATION[phase]);
  return {
    phase,
    capturedAt: 0,
    sampleCount: 10,
    holdMs: 1500,
    // Only the visibility of image landmarks is used by the engine.
    landmarks: world.map((p) => ({ ...p })),
    worldLandmarks: world,
    videoWidth: 960,
    videoHeight: 720,
    scanRegion: 'full',
    widthRatio: 1,
    orientationConfidence: 1,
    ...rest,
  };
}

export function makeCaptures(
  phases: ScanPhaseId[] = ['front', 'left', 'back', 'right'],
  overrides: Parameters<typeof makeCapture>[1] = {},
): Partial<Record<ScanPhaseId, ScanCapture>> {
  return Object.fromEntries(phases.map((phase) => [phase, makeCapture(phase, overrides)]));
}
