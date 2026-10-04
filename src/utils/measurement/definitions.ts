import type { MeasurementId } from '../../types/measurement';
import type { ScanCapture, ScanViewId } from '../../types/scan';
import { LM } from '../pose/landmarks';
import type { ScanRegionId } from '../pose/scanRegions';
import type { LevelId } from '../silhouette/levels';
import type { AngleSample } from './aggregate';
import { distance, midpoint, minVisibility, pathLength, visibleLandmarks } from './geometry';

/*
 * Which measurements exist, for which scan region, and how each is taken.
 *
 * - `landmark`: lengths between joint centres (shoulder width, arm, torso,
 *   leg), one sample per captured angle from the 3D joint positions.
 * - `silhouette`: girths (chest, waist, hip, thigh) and inseam from the body
 *   outline — joints say nothing about the body's surface or the crotch
 *   (see silhouetteMeasure.ts).
 * - `unsupported`: declared with the reason rather than estimated.
 */

/** Landmarks a sample uses must be at least this visible in that capture. */
export const MEASUREMENT_MIN_VISIBILITY = 0.6;

interface BaseDefinition {
  id: MeasurementId;
  name: string;
  definition: string;
  regions: ScanRegionId[];
}

export interface LandmarkDefinition extends BaseDefinition {
  kind: 'landmark';
  /** Angles whose captures may contribute (others would foreshorten or hide the landmarks). */
  angles: ScanViewId[];
  landmarks: string[];
  /** Samples from one capture (e.g. one per visible arm); empty when the landmarks aren't clearly visible. */
  sample: (capture: ScanCapture) => AngleSample[];
}

export type SilhouetteFeature = LevelId | 'inseam';

export interface SilhouetteDefinition extends BaseDefinition {
  kind: 'silhouette';
  feature: SilhouetteFeature;
  /** What the value is based on (shown as the measurement's source). */
  landmarks: string[];
}

export interface UnsupportedDefinition extends BaseDefinition {
  kind: 'unsupported';
  reason: string;
}

export type MeasurementDefinition = LandmarkDefinition | SilhouetteDefinition | UnsupportedDefinition;

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

const GIRTH_SOURCE = ['body outline: front / back width', 'body outline: side depth', 'entered height (scale)'];

export const MEASUREMENT_DEFINITIONS: MeasurementDefinition[] = [
  {
    id: 'shoulder-width',
    name: 'Shoulder width',
    definition: 'Distance between the left and right shoulder joint centres (narrower than an outside-edge shoulder measurement).',
    regions: ['full', 'upper'],
    kind: 'landmark',
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
    kind: 'landmark',
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
    kind: 'landmark',
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
    definition:
      'Chest circumference at its fullest below the armpits, estimated as an ellipse from the front/back width and side depth of your outline.',
    regions: ['full', 'upper'],
    kind: 'silhouette',
    feature: 'chest',
    landmarks: GIRTH_SOURCE,
  },
  {
    id: 'waist',
    name: 'Waist',
    definition:
      'Waist circumference at the narrowest point between chest and hips, estimated as an ellipse from the front/back width and side depth of your outline.',
    regions: ['full', 'upper', 'lower'],
    kind: 'silhouette',
    feature: 'waist',
    landmarks: GIRTH_SOURCE,
  },
  {
    id: 'hip',
    name: 'Hip',
    definition:
      'Hip circumference at the widest point between the hip joints and the crotch, estimated as an ellipse from the front/back width and side depth of your outline.',
    regions: ['full', 'lower'],
    kind: 'silhouette',
    feature: 'hip',
    landmarks: GIRTH_SOURCE,
  },
  {
    id: 'thigh',
    name: 'Thigh',
    definition:
      'Upper-thigh circumference just below the crotch, estimated as an ellipse from one leg’s front/back width and the side depth of your outline.',
    regions: ['full', 'lower'],
    kind: 'silhouette',
    feature: 'thigh',
    landmarks: GIRTH_SOURCE,
  },
  {
    id: 'leg-length',
    name: 'Leg length',
    definition: 'Hip joint → knee → ankle, along the leg (outside leg length to the ankle, from the hip joint).',
    regions: ['full', 'lower'],
    kind: 'landmark',
    angles: ['front', 'left', 'back', 'right'],
    landmarks: ['hip', 'knee', 'ankle'],
    sample: (capture) =>
      eachSide(capture, [LM.leftHip, LM.leftKnee, LM.leftAnkle], [LM.rightHip, LM.rightKnee, LM.rightAnkle]),
  },
  {
    id: 'inseam',
    name: 'Inseam',
    definition:
      'Crotch to floor (top of the gap between your legs to the floor) from the front/back outline. A trouser inseam is usually a little shorter.',
    regions: ['full', 'lower'],
    kind: 'silhouette',
    feature: 'inseam',
    landmarks: ['body outline: crotch and floor', 'entered height (scale)'],
  },
];

export function definitionsForRegion(region: ScanRegionId): MeasurementDefinition[] {
  return MEASUREMENT_DEFINITIONS.filter((definition) => definition.regions.includes(region));
}
