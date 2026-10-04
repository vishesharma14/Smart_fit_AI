import type {
  RecordedAnnyInfo,
  RecordedPredictions,
  TapeMeasurement,
  ValidationMeasurementId,
  ValidationScanAttempt,
  ValidationSubject,
} from '../../types/validation';
import { VALIDATION_MEASUREMENT_IDS } from './definitions';

/*
 * SYNTHETIC — tests only. Hand-picked round numbers so expected errors and metrics can be worked out by hand.
 * They are not measurements of any person and must never be shown as real-person accuracy. Never used by the app.
 */

export const SYNTHETIC_LABEL = 'SYNTHETIC';

/** SYNTHETIC tape values. Leg length is deliberately missing (not taped). */
export const SYNTHETIC_GROUND_TRUTH: TapeMeasurement[] = [
  { name: 'chest', value: 100, unit: 'cm', notes: `${SYNTHETIC_LABEL} test value` },
  { name: 'waist', value: 80, unit: 'cm' },
  { name: 'hip', value: 100, unit: 'cm' },
  { name: 'thigh', value: 55, unit: 'cm' },
  { name: 'inseam', value: 80, unit: 'cm' },
  { name: 'shoulder-width', value: 40, unit: 'cm' },
  { name: 'arm-length', value: 60, unit: 'cm' },
];

type Values = Partial<Record<ValidationMeasurementId, number>>;

export function syntheticPredictions(values: Values, source: 'ellipse' | 'anny'): RecordedPredictions {
  return Object.fromEntries(
    VALIDATION_MEASUREMENT_IDS.map((id) => {
      const value = values[id];
      if (value === undefined)
        return [id, { valueCm: null, status: source === 'ellipse' ? 'invalid' : 'unavailable', reason: `${SYNTHETIC_LABEL}: no value` }];
      return [id, { valueCm: value, status: source === 'ellipse' ? 'uncertain' : 'ok' }];
    }),
  ) as RecordedPredictions;
}

const annyInfo = (ok: boolean): RecordedAnnyInfo => ({
  status: ok ? 'ok' : 'unavailable',
  ...(ok ? {} : { reason: `${SYNTHETIC_LABEL}: fit rejected` }),
  rmsResidualCm: ok ? 0.8 : 3.5,
  heightErrorCm: ok ? 0.2 : 2.4,
  iterations: 6,
  workerMs: 120,
  modelLoadMs: 80,
  fitMs: 40,
  viewsUsed: ['front', 'left', 'back', 'right'],
});

export function syntheticAttempt(attempt: number, ellipse: Values, anny: Values | null): ValidationScanAttempt {
  return {
    attempt,
    timestamp: `2026-01-01T00:0${attempt}:00.000Z`,
    usable: true,
    scanStatus: 'finished',
    finishedEarly: false,
    browser: `${SYNTHETIC_LABEL} browser`,
    performance: {
      scanDurationMs: 60000,
      firstToLastViewMs: 40000,
      meanDetectionsPerSecond: 20,
      minDetectionsPerSecond: 15,
      meanInferenceMs: 30,
      scanCompletedNormally: 'yes',
      cameraResponsive: 'yes',
      browserSlowOrFroze: 'no',
    },
    clothingType: 'activewear',
    clothingFit: 'fitted',
    deviceType: 'phone',
    cameraType: 'rear',
    lighting: 'normal-indoor',
    enteredHeightCm: 175,
    viewsCaptured: ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'],
    ellipse: syntheticPredictions(ellipse, 'ellipse'),
    ellipseCalibration: 'user-height',
    anny: syntheticPredictions(anny ?? {}, 'anny'),
    annyInfo: annyInfo(anny !== null),
  };
}

/** SYNTHETIC attempt 1: ellipse errors +4, −2, +1, (thigh unavailable), +2, +1, −3; Anny −2, +1, −1, −1, −1, 0, +1. */
export const SYNTHETIC_ATTEMPT_1 = syntheticAttempt(
  1,
  { chest: 104, waist: 78, hip: 101, inseam: 82, 'shoulder-width': 41, 'arm-length': 57, 'leg-length': 90 },
  { chest: 98, waist: 81, hip: 99, thigh: 54, inseam: 79, 'shoulder-width': 40, 'arm-length': 61, 'leg-length': 89 },
);
/** SYNTHETIC attempt 2: ellipse chest 102 (others as attempt 1); Anny fit rejected (all unavailable). */
export const SYNTHETIC_ATTEMPT_2 = syntheticAttempt(
  2,
  { chest: 102, waist: 78, hip: 101, inseam: 82, 'shoulder-width': 41, 'arm-length': 57, 'leg-length': 90 },
  null,
);
/** SYNTHETIC attempt 3: ellipse chest 105, waist 79; Anny chest 99. */
export const SYNTHETIC_ATTEMPT_3 = syntheticAttempt(
  3,
  { chest: 105, waist: 79, hip: 101, inseam: 82, 'shoulder-width': 41, 'arm-length': 57, 'leg-length': 90 },
  { chest: 99, waist: 81, hip: 99, thigh: 54, inseam: 79, 'shoulder-width': 40, 'arm-length': 61, 'leg-length': 89 },
);

export function syntheticSubject(attempts: ValidationScanAttempt[] = [SYNTHETIC_ATTEMPT_1]): ValidationSubject {
  return {
    subjectId: 'SYNTH-001',
    heightCm: 175,
    groundTruth: SYNTHETIC_GROUND_TRUTH,
    sides: { thigh: 'right', 'arm-length': 'right' },
    attempts,
    synthetic: true,
  };
}

/** SYNTHETIC unusable attempt (scan not finished): no values. */
export function syntheticUnusableAttempt(attempt: number): ValidationScanAttempt {
  const base = syntheticAttempt(attempt, {}, null);
  return { ...base, usable: false, unusableReason: `${SYNTHETIC_LABEL}: scan not finished`, scanStatus: 'scanning' };
}
