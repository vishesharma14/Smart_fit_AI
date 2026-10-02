import type { PoseFrame, PoseLandmark } from '../../types/pose';
import type { ScanPhaseId } from '../../types/scan';
import { POSE_SCAN_CONFIG, type PoseScanConfig } from './poseConfig';
import { LM, mid, toPixels, type Point, type VisibleRegion } from './landmarks';
import { estimateOrientation, type CoarseView, type OrientationCalibration, type OrientationEstimate } from './poseOrientation';

/*
 * Per-frame pose validation for one scan angle. Checks run in a fixed order
 * and the first failure is reported, so the user always gets the single most
 * useful instruction. Every check reads real landmarks from the pose model;
 * nothing here estimates body measurements.
 */

export type BodyPart = 'head' | 'shoulders' | 'hips' | 'knees' | 'feet';

export type PoseIssue =
  | { kind: 'no-person' }
  | { kind: 'multiple-people' }
  | { kind: 'too-close' }
  | { kind: 'too-far' }
  | { kind: 'head-out' }
  | { kind: 'feet-out' }
  | { kind: 'off-centre' }
  | { kind: 'body-hidden'; part: BodyPart }
  | { kind: 'wrong-orientation'; detected: ScanPhaseId | null }
  | { kind: 'not-upright' }
  | { kind: 'arms-down' }
  | { kind: 'arms-raised' }
  | { kind: 'feet-together' }
  | { kind: 'feet-wide' };

export type PoseIssueKind = PoseIssue['kind'];

/** Geometry behind the decision, shown by the debug panel. */
export interface PoseMetrics {
  /** Estimated head-top-to-feet height ÷ visible preview height. */
  bodyHeight: number;
  torsoTiltDeg: number;
  /** Arm angles away from the torso (person's left, right). */
  armAnglesDeg: [number, number];
  stanceRatio: number;
  /** Torso length in pixels (used to normalise movement). */
  torsoPx: number;
}

export interface PoseAssessment {
  /** First failed check, or null when the pose is valid for the requested angle. */
  issue: PoseIssue | null;
  /** Number of people the model found. */
  people: number;
  orientation: OrientationEstimate | null;
  metrics: PoseMetrics | null;
  /** The person being validated (image and world landmarks). */
  landmarks: PoseLandmark[] | null;
  worldLandmarks: PoseLandmark[] | null;
  /** Same landmarks in pixels, for movement tracking. */
  pixels: Point[] | null;
}

export interface AssessPoseInput {
  frame: PoseFrame;
  region: VisibleRegion;
  target: ScanPhaseId;
  calibration: OrientationCalibration | null;
  previousView: CoarseView | null;
  config?: PoseScanConfig;
}

/** Landmarks for each side (left, right) of a body part; a side counts as seen if any of its points is. */
const PAIRS: Record<Exclude<BodyPart, 'head'>, readonly [readonly number[], readonly number[]]> = {
  shoulders: [[LM.leftShoulder], [LM.rightShoulder]],
  hips: [[LM.leftHip], [LM.rightHip]],
  knees: [[LM.leftKnee], [LM.rightKnee]],
  feet: [
    [LM.leftAnkle, LM.leftHeel, LM.leftFoot],
    [LM.rightAnkle, LM.rightHeel, LM.rightFoot],
  ],
};

/** Points that must stay inside the visible preview (left/right edges). */
const EDGE_POINTS = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
  LM.leftHeel,
  LM.rightHeel,
  LM.leftFoot,
  LM.rightFoot,
] as const;

const FEET = [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftFoot, LM.rightFoot] as const;

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/** Angle between two 2D directions, in degrees (0–180). */
function angleBetween(a: Point, b: Point): number {
  const dot = a.x * b.x + a.y * b.y;
  const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  return length === 0 ? 0 : degrees(Math.acos(Math.min(1, Math.max(-1, dot / length))));
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxOf = (pose: PoseLandmark[]): Box => ({
  x0: Math.min(...pose.map((p) => p.x)),
  y0: Math.min(...pose.map((p) => p.y)),
  x1: Math.max(...pose.map((p) => p.x)),
  y1: Math.max(...pose.map((p) => p.y)),
});

function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const area = (box: Box) => (box.x1 - box.x0) * (box.y1 - box.y0);
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? (w * h) / smaller : 0;
}

/**
 * Number of distinct people. The model occasionally returns the same person
 * twice; a pose whose outline mostly overlaps one already counted is the same person.
 */
export function countPeople(poses: PoseLandmark[][]): number {
  const kept: Box[] = [];
  for (const pose of poses) {
    const box = boxOf(pose);
    if (!kept.some((other) => overlap(box, other) > 0.6)) kept.push(box);
  }
  return kept.length;
}

/** Picks the person to validate: the one with the largest on-screen torso. */
function primaryIndex(frame: PoseFrame): number {
  let best = 0;
  let bestSize = -1;
  frame.landmarks.forEach((pose, index) => {
    const size = Math.abs(pose[LM.leftShoulder].y - pose[LM.leftHip].y) + Math.abs(pose[LM.rightShoulder].y - pose[LM.rightHip].y);
    if (size > bestSize) {
      best = index;
      bestSize = size;
    }
  });
  return best;
}

export function assessPose({
  frame,
  region,
  target,
  calibration,
  previousView,
  config = POSE_SCAN_CONFIG,
}: AssessPoseInput): PoseAssessment {
  const people = countPeople(frame.landmarks);
  const empty: PoseAssessment = {
    issue: { kind: 'no-person' },
    people,
    orientation: null,
    metrics: null,
    landmarks: null,
    worldLandmarks: null,
    pixels: null,
  };
  if (people === 0) return empty;

  const index = primaryIndex(frame);
  const pose = frame.landmarks[index];
  const world = frame.worldLandmarks[index];
  const { videoWidth: width, videoHeight: height } = frame;
  const px = toPixels(pose, width, height);
  const seen = (i: number) => pose[i].visibility >= config.minVisibility;

  const shoulderMid = mid(px[LM.leftShoulder], px[LM.rightShoulder]);
  const hipMid = mid(px[LM.leftHip], px[LM.rightHip]);
  const torsoPx = Math.max(Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y), 1);

  // Head top is above the landmarks (which stop at the eyes and ears): extrapolate from the neck length.
  const earMid = mid(px[LM.leftEar], px[LM.rightEar]);
  const headTop = earMid.y - 0.7 * Math.max(shoulderMid.y - earMid.y, 0);
  const feetBottom = Math.max(...FEET.map((i) => px[i].y));

  const top = region.y0 * height;
  const visibleHeight = (region.y1 - region.y0) * height;
  const left = region.x0 * width;
  const visibleWidth = (region.x1 - region.x0) * width;
  const bodyHeight = (feetBottom - headTop) / visibleHeight;

  const orientation = estimateOrientation(px, pose, world, calibration, previousView);
  const torsoTiltDeg = degrees(Math.atan2(Math.abs(hipMid.x - shoulderMid.x), Math.max(hipMid.y - shoulderMid.y, 1e-6)));
  const down = { x: hipMid.x - shoulderMid.x, y: hipMid.y - shoulderMid.y };
  const armAngle = (shoulder: number, elbow: number, wrist: number) => {
    const end = seen(wrist) ? px[wrist] : px[elbow];
    return angleBetween(down, { x: end.x - px[shoulder].x, y: end.y - px[shoulder].y });
  };
  const armAnglesDeg: [number, number] = [
    armAngle(LM.leftShoulder, LM.leftElbow, LM.leftWrist),
    armAngle(LM.rightShoulder, LM.rightElbow, LM.rightWrist),
  ];
  const hipSpan = Math.max(Math.abs(px[LM.leftHip].x - px[LM.rightHip].x), 1);
  const stanceRatio = Math.abs(px[LM.leftAnkle].x - px[LM.rightAnkle].x) / hipSpan;

  const result: PoseAssessment = {
    issue: null,
    people,
    orientation,
    metrics: { bodyHeight, torsoTiltDeg, armAnglesDeg, stanceRatio, torsoPx },
    landmarks: pose,
    worldLandmarks: world,
    pixels: px,
  };
  const fail = (issue: PoseIssue): PoseAssessment => ({ ...result, issue });

  // 1. Exactly one person.
  if (people > 1) return fail({ kind: 'multiple-people' });

  // 2. Head and feet inside the visible preview.
  const headOut = headTop < top + config.verticalMargin * visibleHeight;
  const feetOut = feetBottom > top + visibleHeight * (1 - config.verticalMargin);
  if (headOut || feetOut) {
    if ((headOut && feetOut) || bodyHeight > config.maxBodyHeight) return fail({ kind: 'too-close' });
    return fail({ kind: headOut ? 'head-out' : 'feet-out' });
  }

  // 3. Distance from the camera, from the body's share of the preview height.
  if (bodyHeight > config.maxBodyHeight) return fail({ kind: 'too-close' });
  if (bodyHeight < config.minBodyHeight) return fail({ kind: 'too-far' });

  // 4. Arms, legs and feet inside the left and right edges.
  const margin = config.horizontalMargin * visibleWidth;
  if (EDGE_POINTS.some((i) => px[i].x < left + margin || px[i].x > left + visibleWidth - margin)) {
    return fail({ kind: 'off-centre' });
  }

  // 5. Key joints clearly visible (not hidden by clothing, furniture or poor light). Side-on, the far
  //    side of the body is naturally hidden, so one of each pair is enough.
  const frontal = orientation.view === 'frontal';
  // From behind the face is hidden by design, so the head is only required for the other angles.
  const headSeen = frontal && target === 'front' ? seen(LM.nose) : seen(LM.nose) || seen(LM.leftEar) || seen(LM.rightEar);
  if (target !== 'back' && !headSeen) return fail({ kind: 'body-hidden', part: 'head' });
  for (const [part, [leftSide, rightSide]] of Object.entries(PAIRS) as [
    Exclude<BodyPart, 'head'>,
    readonly [readonly number[], readonly number[]],
  ][]) {
    const leftSeen = leftSide.some(seen);
    const rightSeen = rightSide.some(seen);
    const visible = frontal ? leftSeen && rightSeen : leftSeen || rightSeen;
    if (!visible) return fail({ kind: 'body-hidden', part });
  }

  // 6. Facing the requested direction.
  if (orientation.orientation !== target) return fail({ kind: 'wrong-orientation', detected: orientation.orientation });

  // 7. Standing upright.
  if (torsoTiltDeg > config.maxTorsoTiltDeg) return fail({ kind: 'not-upright' });

  // 8. Front and back: arms slightly away from the body and feet apart, so the torso and legs are separable.
  if (target === 'front' || target === 'back') {
    if (Math.min(...armAnglesDeg) < config.minArmAngleDeg) return fail({ kind: 'arms-down' });
    if (Math.max(...armAnglesDeg) > config.maxArmAngleDeg) return fail({ kind: 'arms-raised' });
    if (stanceRatio < config.minStanceRatio) return fail({ kind: 'feet-together' });
    if (stanceRatio > config.maxStanceRatio) return fail({ kind: 'feet-wide' });
  }

  return result;
}

/** Landmarks tracked for stillness: head, torso and leg joints. */
const STILLNESS_POINTS = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
] as const;

export interface StillnessSample {
  time: number;
  pixels: Point[];
  torsoPx: number;
}

/**
 * How much the body moved over the recent samples: the average spread of
 * each tracked joint around its mean position, relative to torso length.
 * Returns null until there are enough samples to judge.
 */
export function measureJitter(samples: StillnessSample[]): number | null {
  if (samples.length < 3) return null;
  const torso = samples.reduce((sum, sample) => sum + sample.torsoPx, 0) / samples.length;
  let spread = 0;
  for (const index of STILLNESS_POINTS) {
    const mx = samples.reduce((sum, sample) => sum + sample.pixels[index].x, 0) / samples.length;
    const my = samples.reduce((sum, sample) => sum + sample.pixels[index].y, 0) / samples.length;
    const maxDistance = Math.max(
      ...samples.map((sample) => Math.hypot(sample.pixels[index].x - mx, sample.pixels[index].y - my)),
    );
    spread += maxDistance;
  }
  return spread / STILLNESS_POINTS.length / torso;
}

/** Consecutive-valid-frame tracking for auto-capture. */
export interface HoldState {
  /** When the current run of valid frames started, or null when not holding. */
  since: number | null;
  frames: number;
}

export const HOLD_RESET: HoldState = { since: null, frames: 0 };

/** Adds one analysed frame. Any invalid frame restarts the hold. */
export function stepHold(state: HoldState, valid: boolean, now: number): HoldState {
  if (!valid) return HOLD_RESET;
  return { since: state.since ?? now, frames: state.frames + 1 };
}

/** 0–1 progress toward auto-capture. Complete only when both the time and frame requirements are met. */
export function holdProgress(state: HoldState, now: number, config: PoseScanConfig = POSE_SCAN_CONFIG): number {
  if (state.since === null) return 0;
  return Math.min((now - state.since) / config.captureHoldMs, state.frames / config.captureMinFrames, 1);
}

/** Per-landmark average of the frames collected during a hold, to reduce frame-to-frame noise. */
export function averageLandmarks(frames: PoseLandmark[][]): PoseLandmark[] {
  const count = frames.length;
  return frames[0].map((_, index) => {
    const sum = { x: 0, y: 0, z: 0, visibility: 0 };
    for (const frame of frames) {
      sum.x += frame[index].x;
      sum.y += frame[index].y;
      sum.z += frame[index].z;
      sum.visibility += frame[index].visibility;
    }
    return { x: sum.x / count, y: sum.y / count, z: sum.z / count, visibility: sum.visibility / count };
  });
}
