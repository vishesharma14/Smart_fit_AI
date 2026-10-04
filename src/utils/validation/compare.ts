import type {
  RecordedPrediction,
  ValidationMeasurementId,
  ValidationScanAttempt,
  ValidationSubject,
} from '../../types/validation';
import { VALIDATION_MEASUREMENTS } from './definitions';
import { truthFor } from './groundTruth';

/*
 * Tape vs current ellipse engine vs Anny shadow, per measurement of one scan attempt.
 *
 * Errors are computed only where both the tape value and the prediction exist. A missing prediction is reported
 * as unavailable and gets no error; nothing is substituted for it.
 */

export type ValidationSource = 'ellipse' | 'anny';
export const VALIDATION_SOURCES: readonly ValidationSource[] = ['ellipse', 'anny'];
export const SOURCE_LABELS: Record<ValidationSource, string> = { ellipse: 'Current ellipse', anny: 'Anny shadow' };

export interface PredictionError {
  /** Predicted − tape (cm): positive = the scan measured larger. */
  signedCm: number;
  absCm: number;
  /** |error| ÷ tape × 100. */
  percent: number;
}

export interface SourceComparison {
  predictedCm: number | null;
  status: RecordedPrediction['status'];
  /** The engine gave no value. */
  unavailable: boolean;
  reason?: string;
  /** Null when the prediction is unavailable or there is no tape value. */
  error: PredictionError | null;
}

export interface MeasurementComparison {
  id: ValidationMeasurementId;
  label: string;
  /** Tape value (cm); null when this measurement was not taped. */
  truthCm: number | null;
  ellipse: SourceComparison;
  anny: SourceComparison;
}

export function predictionError(predictedCm: number, truthCm: number): PredictionError {
  const signedCm = predictedCm - truthCm;
  const absCm = Math.abs(signedCm);
  return { signedCm, absCm, percent: (absCm / truthCm) * 100 };
}

function compareSource(prediction: RecordedPrediction, truthCm: number | null): SourceComparison {
  const value = prediction.valueCm;
  const available = typeof value === 'number' && Number.isFinite(value);
  return {
    predictedCm: available ? value : null,
    status: prediction.status,
    unavailable: !available,
    ...(prediction.reason ? { reason: prediction.reason } : {}),
    error: available && truthCm !== null && truthCm > 0 ? predictionError(value, truthCm) : null,
  };
}

export function compareAttempt(subject: ValidationSubject, attempt: ValidationScanAttempt): MeasurementComparison[] {
  return VALIDATION_MEASUREMENTS.map(({ id, label }) => {
    const truthCm = truthFor(subject.groundTruth, id)?.value ?? null;
    return {
      id,
      label,
      truthCm,
      ellipse: compareSource(attempt.ellipse[id], truthCm),
      anny: compareSource(attempt.anny[id], truthCm),
    };
  });
}
