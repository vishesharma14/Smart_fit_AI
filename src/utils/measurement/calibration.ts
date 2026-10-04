import type { CalibrationResult, MeasurementUnit } from '../../types/measurement';
import type { ScanCapture } from '../../types/scan';
import { LM } from '../pose/landmarks';
import { aggregateSamples, combineConfidence, type AngleSample } from './aggregate';
import { distance, isFinitePoint, midpoint, visibleLandmarks } from './geometry';

/*
 * Calibration: how landmark distances become centimetres.
 *
 * Pixels are never treated as centimetres. Lengths are measured on the
 * model's 3D world landmarks, whose units are the pose model's own *estimate*
 * of metres (monocular, unverified). A calibration supplies the real-world
 * scale:
 *
 * - `user-height`: the height the user entered ÷ their stature measured in the
 *   same world units from a full-body capture. Preferred when available.
 * - `pose-model-metric`: the model's metre estimate taken at face value
 *   (×100 → cm). A fallback with low confidence: it is never enough on its own
 *   for a measurement to be `valid`.
 * - `none`: no scale; values stay in model units.
 *
 * Further methods (e.g. a reference object of known size) can be added as
 * more candidates for `chooseCalibration`.
 */

/** Trust in the pose model's own metric scale (unverified monocular estimate). */
export const POSE_MODEL_METRIC_CONFIDENCE = 0.35;
/** Trust in a height the user typed in. */
export const USER_HEIGHT_CONFIDENCE = 0.95;
/** The head top is extrapolated above the ears (no landmark there), so stature is a little less certain. */
export const HEAD_TOP_EXTRAPOLATION_CONFIDENCE = 0.85;
/** Same head-top rule as the scan's framing check: 0.7 × neck length above the ears. */
const HEAD_TOP_FACTOR = 0.7;
/** Plausible human heights (cm) accepted for calibration. */
export const HEIGHT_RANGE_CM = { min: 50, max: 272 } as const;

const MIN_VISIBILITY = 0.6;
const STATURE_POINTS = [
  LM.leftEar,
  LM.rightEar,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHeel,
  LM.rightHeel,
] as const;

export const UNCALIBRATED: CalibrationResult = {
  method: 'none',
  cmPerUnit: null,
  confidence: 0,
  detail: 'No real-world scale: values are in pose-model units.',
};

export function poseModelMetricCalibration(): CalibrationResult {
  return {
    method: 'pose-model-metric',
    cmPerUnit: 100,
    confidence: POSE_MODEL_METRIC_CONFIDENCE,
    detail: "Scale from the pose model's own metre estimate (not verified against a known size).",
  };
}

/**
 * Stature (head top to heels) in world units from one capture, or null when
 * the ears, shoulders and both heels aren't all clearly visible.
 */
export function statureSample(capture: ScanCapture): AngleSample | null {
  const points = visibleLandmarks(capture.worldLandmarks, capture.landmarks, STATURE_POINTS, MIN_VISIBILITY);
  if (!points) return null;
  const [leftEar, rightEar, leftShoulder, rightShoulder, leftHeel, rightHeel] = points;
  const earMid = midpoint(leftEar, rightEar);
  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  // Head top: continue the shoulder→ear direction by 0.7 neck lengths (the scan's framing rule).
  const headTop = {
    x: earMid.x + HEAD_TOP_FACTOR * (earMid.x - shoulderMid.x),
    y: earMid.y + HEAD_TOP_FACTOR * (earMid.y - shoulderMid.y),
    z: earMid.z + HEAD_TOP_FACTOR * (earMid.z - shoulderMid.z),
  };
  const heelMid = midpoint(leftHeel, rightHeel);
  if (!isFinitePoint(headTop)) return null;
  // Vertical extent (world y is vertical for an upright person, which the scan validates).
  const value = Math.abs(heelMid.y - headTop.y);
  // Guard against a degenerate pose: the vertical extent should dominate the overall extent.
  if (!(value > 0) || value < 0.9 * distance(headTop, heelMid)) return null;
  const weight = Math.min(...STATURE_POINTS.map((i) => capture.landmarks[i].visibility));
  return { angle: capture.phase, value, weight };
}

/**
 * Scale from the user's entered height, using the stature measured in front
 * and back captures. Null when the height is missing/implausible or no capture
 * shows the whole body clearly enough.
 */
export function calibrateFromUserHeight(
  userHeightCm: number | null | undefined,
  captures: ScanCapture[],
): CalibrationResult | null {
  if (typeof userHeightCm !== 'number' || !Number.isFinite(userHeightCm)) return null;
  if (userHeightCm < HEIGHT_RANGE_CM.min || userHeightCm > HEIGHT_RANGE_CM.max) return null;
  const samples = captures
    .filter((c) => c.phase === 'front' || c.phase === 'back')
    .map(statureSample)
    .filter((s): s is AngleSample => s !== null);
  const stature = aggregateSamples(samples, { maxRelativeSpread: 0.08 });
  if (!stature) return null;
  const confidence = combineConfidence([
    USER_HEIGHT_CONFIDENCE,
    HEAD_TOP_EXTRAPOLATION_CONFIDENCE,
    stature.meanWeight,
    stature.consistency,
  ]);
  return {
    method: 'user-height',
    cmPerUnit: userHeightCm / stature.value,
    confidence,
    detail: `Scale from your entered height (${userHeightCm} cm) and your stature measured in ${stature.angles.join(' and ')} view.`,
  };
}

/** Picks the most trustworthy available calibration. */
export function chooseCalibration(candidates: (CalibrationResult | null)[]): CalibrationResult {
  let best: CalibrationResult = UNCALIBRATED;
  for (const candidate of candidates) {
    if (candidate && candidate.cmPerUnit !== null && Number.isFinite(candidate.cmPerUnit) && candidate.cmPerUnit > 0) {
      if (candidate.confidence > best.confidence) best = candidate;
    }
  }
  return best;
}

/** Converts a world-unit length with a calibration (unchanged, in model units, when there is no scale). */
export function applyCalibration(
  valueUnits: number,
  calibration: CalibrationResult,
): { value: number; unit: MeasurementUnit } {
  if (calibration.cmPerUnit === null) return { value: valueUnits, unit: 'model-units' };
  return { value: valueUnits * calibration.cmPerUnit, unit: 'cm' };
}

/**
 * The joints only give a rough stature (the head top is extrapolated above the ears), so the outline's stature may
 * differ from it by this much without penalty, and is distrusted beyond the maximum.
 */
export const SILHOUETTE_STATURE_TOLERANCE = 0.1;
export const SILHOUETTE_STATURE_MAX_DISAGREEMENT = 0.25;

export interface SilhouetteScale {
  cmPerPx: number;
  /** 0–1 trust in this capture's scale. */
  confidence: number;
}

/**
 * Per-capture scale for outline measurements: the entered height ÷ the
 * outline's head top → floor distance in that capture. Each capture gets its
 * own scale, so stepping slightly nearer or further between angles doesn't
 * matter. Null without a plausible height, without an outline, when the head
 * or feet are cut off, or when the outline's height disagrees strongly with
 * the joints (e.g. a background object merged into the outline).
 */
export function silhouetteScale(capture: ScanCapture, userHeightCm: number | null | undefined): SilhouetteScale | null {
  if (typeof userHeightCm !== 'number' || !Number.isFinite(userHeightCm)) return null;
  if (userHeightCm < HEIGHT_RANGE_CM.min || userHeightCm > HEIGHT_RANGE_CM.max) return null;
  const outline = capture.silhouette;
  if (!outline || outline.headTopY === null || outline.floorY === null || outline.headClipped || outline.floorClipped) return null;
  const staturePx = outline.floorY - outline.headTopY;
  if (!(staturePx > 0)) return null;

  // Rough cross-check from the joints, in the same mask pixels: head top extrapolated above the ears, to the heels.
  const y = (i: number) => capture.landmarks[i]?.y * outline.height;
  const earY = (y(LM.leftEar) + y(LM.rightEar)) / 2;
  const shoulderY = (y(LM.leftShoulder) + y(LM.rightShoulder)) / 2;
  const heelY = (y(LM.leftHeel) + y(LM.rightHeel)) / 2;
  const jointStature = heelY - (earY + HEAD_TOP_FACTOR * (earY - shoulderY));
  if (!(jointStature > 0)) return null;
  const disagreement = Math.abs(staturePx - jointStature) / staturePx;
  if (disagreement > SILHOUETTE_STATURE_MAX_DISAGREEMENT) return null;

  return {
    cmPerPx: userHeightCm / staturePx,
    confidence: combineConfidence([
      USER_HEIGHT_CONFIDENCE,
      1 -
        Math.max(0, disagreement - SILHOUETTE_STATURE_TOLERANCE) /
          (SILHOUETTE_STATURE_MAX_DISAGREEMENT - SILHOUETTE_STATURE_TOLERANCE),
    ]),
  };
}
