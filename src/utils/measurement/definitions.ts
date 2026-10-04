import type { MeasurementId } from '../../types/measurement';
import type { ScanCapture, ScanPhaseId } from '../../types/scan';
import { LM } from '../pose/landmarks';
import type { ScanRegionId } from '../pose/scanRegions';
import type { AngleSample } from './aggregate';
import { distance, midpoint, minVisibility, pathLength, visibleLandmarks } from './geometry';

/*
 * Which measurements exist, for which scan region, and how each is taken from
 * one captured angle.
 *
 * Joint landmarks give the positions of joint centres, so they support
 * lengths between joints (shoulder width, arm, torso, leg). They say nothing
 * about the body's surface, so girths (chest, waist, hip, thigh) and points
 * that aren't landmarks (the crotch, for inseam) are declared `unsupported`
 * with the reason, rather than estimated.
 */

/** Landmarks a sample uses must be at least this visible in that capture. */
export const MEASUREMENT_MIN_VISIBILITY = 0.6;

interface BaseDefinition {
  id: MeasurementId;
  name: string;
  definition: string;
  regions: ScanRegionId[];
}

export interface SupportedDefinition extends BaseDefinition {
  supported: true;
  /** Angles whose captures may contribute (others would foreshorten or hide the landmarks). */
  angles: ScanPhaseId[];
  landmarks: string[];
  /** Samples from one capture (e.g. one per visible arm); empty when the landmarks aren't clearly visible. */
  sample: (capture: ScanCapture) => AngleSample[];
}

export interface UnsupportedDefinition extends BaseDefinition {
  supported: false;
  reason: string;
}

export type MeasurementDefinition = SupportedDefinition | UnsupportedDefinition;

/** A path through landmarks in one capture, if they are all clearly visible. */
function pathSample(capture: ScanCapture, indices: readonly number[]): AngleSample | null {
  const points = visibleLandmarks(capture.worldLandmarks, capture.landmarks, indices, MEASUREMENT_MIN_VISIBILITY);
  if (!points) return null;
  return { angle: capture.phase, value: pathLength(points), weight: minVisibility(capture.landmarks, indices) };
}

/** One sample per side (left, right) whose landmark chain is clearly visible. */
function eachSide(capture: ScanCapture, left: readonly number[], right: readonly number[]): AngleSample[] {
  return [pathSample(capture, left), pathSample(capture, right)].filter((s): s is AngleSample => s !== null);
}

const GIRTH_REASON =
  'Needs the outline of the body at that height (front and side silhouette). The scan stores joint positions only, which do not describe body girth.';

export const MEASUREMENT_DEFINITIONS: MeasurementDefinition[] = [
  {
    id: 'shoulder-width',
    name: 'Shoulder width',
    definition: 'Distance between the left and right shoulder joint centres (narrower than an outside-edge shoulder measurement).',
    regions: ['full', 'upper'],
    supported: true,
    // Both shoulders are only clearly visible facing toward or away from the camera.
    angles: ['front', 'back'],
    landmarks: ['left_shoulder', 'right_shoulder'],
    sample: (capture) => {
      const s = pathSample(capture, [LM.leftShoulder, LM.rightShoulder]);
      return s ? [s] : [];
    },
  },
  {
    id: 'arm-length',
    name: 'Arm length',
    definition: 'Shoulder joint → elbow → wrist, along the arm.',
    regions: ['full', 'upper'],
    supported: true,
    // Side views show the near arm clearly; front and back show both.
    angles: ['front', 'left', 'back', 'right'],
    landmarks: ['shoulder', 'elbow', 'wrist'],
    sample: (capture) =>
      eachSide(
        capture,
        [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
        [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
      ),
  },
  {
    id: 'torso-length',
    name: 'Torso length',
    definition: 'Midpoint between the shoulder joints → midpoint between the hip joints.',
    regions: ['full', 'upper'],
    supported: true,
    angles: ['front', 'back'],
    landmarks: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
    sample: (capture) => {
      const indices = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
      const points = visibleLandmarks(capture.worldLandmarks, capture.landmarks, indices, MEASUREMENT_MIN_VISIBILITY);
      if (!points) return [];
      const [ls, rs, lh, rh] = points;
      return [{ angle: capture.phase, value: distance(midpoint(ls, rs), midpoint(lh, rh)), weight: minVisibility(capture.landmarks, indices) }];
    },
  },
  {
    id: 'chest',
    name: 'Chest',
    definition: 'Chest circumference.',
    regions: ['full', 'upper'],
    supported: false,
    reason: GIRTH_REASON,
  },
  {
    id: 'waist',
    name: 'Waist',
    definition: 'Waist circumference.',
    regions: ['full', 'upper', 'lower'],
    supported: false,
    reason: GIRTH_REASON,
  },
  {
    id: 'hip',
    name: 'Hip',
    definition: 'Hip circumference.',
    regions: ['full', 'lower'],
    supported: false,
    reason: GIRTH_REASON,
  },
  {
    id: 'thigh',
    name: 'Thigh',
    definition: 'Thigh circumference.',
    regions: ['full', 'lower'],
    supported: false,
    reason: GIRTH_REASON,
  },
  {
    id: 'leg-length',
    name: 'Leg length',
    definition: 'Hip joint → knee → ankle, along the leg (outside leg length to the ankle, from the hip joint).',
    regions: ['full', 'lower'],
    supported: true,
    angles: ['front', 'left', 'back', 'right'],
    landmarks: ['hip', 'knee', 'ankle'],
    sample: (capture) =>
      eachSide(capture, [LM.leftHip, LM.leftKnee, LM.leftAnkle], [LM.rightHip, LM.rightKnee, LM.rightAnkle]),
  },
  {
    id: 'inseam',
    name: 'Inseam',
    definition: 'Crotch to ankle along the inside of the leg.',
    regions: ['full', 'lower'],
    supported: false,
    reason:
      'Needs the crotch point, which is not a pose landmark. Leg length (hip joint to ankle) is measured instead; inseam would need the body outline.',
  },
];

export function definitionsForRegion(region: ScanRegionId): MeasurementDefinition[] {
  return MEASUREMENT_DEFINITIONS.filter((definition) => definition.regions.includes(region));
}
