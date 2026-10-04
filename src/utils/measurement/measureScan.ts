import type { CalibrationResult, Measurement, MeasurementReport } from '../../types/measurement';
import type { ScanCapture, ScanPhaseId } from '../../types/scan';
import type { ScanRegionId } from '../pose/scanRegions';
import { aggregateSamples, angleCoverage, combineConfidence, statusFromConfidence, type AngleSample } from './aggregate';
import { applyCalibration, calibrateFromUserHeight, chooseCalibration, poseModelMetricCalibration } from './calibration';
import { definitionsForRegion, type LandmarkDefinition, type UnsupportedDefinition } from './definitions';
import { measureSilhouette } from './silhouetteMeasure';

/*
 * The measurement engine: turns the scan's captured angles (averaged pose
 * landmarks and body-outline numbers, no images) into body measurements for
 * the region of the selected garment.
 *
 * Deterministic and pure: the same captures and height always give the same
 * report. Nothing is invented — a measurement without enough evidence is
 * `invalid` (no value), one joint landmarks can't describe is `unsupported`,
 * and one computed with limited evidence is `uncertain`.
 */

/** MediaPipe Pose returns 33 landmarks per person. */
export const POSE_LANDMARK_COUNT = 33;
const PHASE_ORDER: ScanPhaseId[] = ['front', 'left', 'back', 'right'];

/** Below these, the reason names the factor as a cause. */
const LOW_VISIBILITY = 0.8;
const LOW_CONSISTENCY = 0.5;

export interface MeasureScanInput {
  captures: Partial<Record<ScanPhaseId, ScanCapture>>;
  region: ScanRegionId;
  /** The height the user entered (cm); enables the `user-height` calibration. */
  userHeightCm?: number | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** Captures that belong to this scan, plus a warning for each one ignored. */
function usableCaptures(input: MeasureScanInput): { captures: ScanCapture[]; warnings: string[] } {
  const captures: ScanCapture[] = [];
  const warnings: string[] = [];
  for (const phase of PHASE_ORDER) {
    const capture = input.captures[phase];
    if (!capture) continue;
    if (capture.phase !== phase) {
      warnings.push(`The ${phase} capture is labelled "${capture.phase}" and was ignored.`);
    } else if (capture.scanRegion !== input.region && capture.scanRegion !== 'full') {
      // A full-body capture serves every region; a partial one only its own.
      warnings.push(`The ${phase} capture was taken for the ${capture.scanRegion} region, not ${input.region}, and was ignored.`);
    } else if (
      !Array.isArray(capture.landmarks) ||
      !Array.isArray(capture.worldLandmarks) ||
      capture.landmarks.length !== POSE_LANDMARK_COUNT ||
      capture.worldLandmarks.length !== POSE_LANDMARK_COUNT
    ) {
      warnings.push(`The ${phase} capture has incomplete landmark data and was ignored.`);
    } else {
      captures.push(capture);
    }
  }
  return { captures, warnings };
}

function unsupported(definition: UnsupportedDefinition, calibration: CalibrationResult): Measurement {
  return {
    id: definition.id,
    name: definition.name,
    definition: definition.definition,
    value: null,
    unit: calibration.cmPerUnit === null ? 'model-units' : 'cm',
    confidence: 0,
    source: { method: 'not-measurable', angles: [], sampleCount: 0, landmarks: [], calibration: calibration.method },
    status: 'unsupported',
    reason: definition.reason,
  };
}

function measure(definition: LandmarkDefinition, captures: ScanCapture[], calibration: CalibrationResult): Measurement {
  const base = {
    id: definition.id,
    name: definition.name,
    definition: definition.definition,
    unit: calibration.cmPerUnit === null ? ('model-units' as const) : ('cm' as const),
  };
  const relevant = captures.filter((capture) => definition.angles.includes(capture.phase));
  const samples: AngleSample[] = relevant.flatMap((capture) => definition.sample(capture));
  const aggregate = aggregateSamples(samples);

  if (!aggregate) {
    const reason =
      relevant.length === 0
        ? `No usable capture from the angles this needs (${definition.angles.join(', ')}).`
        : 'The landmarks it needs were not clearly visible in any captured angle.';
    return {
      ...base,
      value: null,
      confidence: 0,
      source: { method: 'landmark-geometry', angles: [], sampleCount: 0, landmarks: definition.landmarks, calibration: calibration.method },
      status: 'invalid',
      reason,
    };
  }

  const coverage = angleCoverage(aggregate.angles.length, definition.angles.length);
  // Missing angles lower confidence, but one clear angle is still evidence: coverage scales 0.5–1.
  const coverageFactor = 0.5 + 0.5 * coverage;
  // Without a scale there is nothing to discount; such values are capped at `uncertain` below.
  const calibrationFactor = calibration.method === 'none' ? 1 : calibration.confidence;
  const confidence = round3(
    combineConfidence([aggregate.meanWeight, aggregate.consistency, coverageFactor, calibrationFactor]),
  );
  const calibrated = calibration.method === 'user-height';
  const status = statusFromConfidence(confidence, calibrated);
  const { value } = applyCalibration(aggregate.value, calibration);

  const causes: string[] = [];
  if (aggregate.meanWeight < LOW_VISIBILITY) causes.push('the landmarks were only partly visible');
  if (aggregate.sampleCount === 1) causes.push('only one view could be measured, so it could not be cross-checked');
  else if (aggregate.consistency < LOW_CONSISTENCY) causes.push('the captured angles disagree');
  if (aggregate.angles.length < definition.angles.length) {
    const missing = definition.angles.filter((angle) => !aggregate.angles.includes(angle));
    causes.push(`no usable sample from the ${missing.join(', ')} view`);
  }
  if (!calibrated) {
    causes.push(
      calibration.method === 'none'
        ? 'there is no real-world scale'
        : "the scale is the pose model's own estimate (enter your height and complete a full-body front or back capture for a calibrated scale)",
    );
  }
  const reason =
    status === 'valid' ? undefined : `${status === 'invalid' ? 'Too little evidence' : 'Limited evidence'}: ${causes.join('; ') || 'low overall confidence'}.`;

  return {
    ...base,
    value: status === 'invalid' ? null : round1(value),
    confidence,
    source: {
      method: 'landmark-geometry',
      angles: aggregate.angles,
      sampleCount: aggregate.sampleCount,
      landmarks: definition.landmarks,
      calibration: calibration.method,
    },
    status,
    ...(reason ? { reason } : {}),
  };
}

/** Measures every measurement defined for the region from the captured angles. */
export function measureScan(input: MeasureScanInput): MeasurementReport {
  const { captures, warnings } = usableCaptures(input);
  const calibration = chooseCalibration([
    calibrateFromUserHeight(input.userHeightCm, captures),
    poseModelMetricCalibration(),
  ]);
  const measurements = definitionsForRegion(input.region).map((definition) =>
    definition.kind === 'landmark'
      ? measure(definition, captures, calibration)
      : definition.kind === 'silhouette'
        ? measureSilhouette(definition, captures, input.userHeightCm)
        : unsupported(definition, calibration),
  );
  return {
    region: input.region,
    measurements,
    calibration,
    anglesUsed: captures.map((capture) => capture.phase),
    warnings,
  };
}
