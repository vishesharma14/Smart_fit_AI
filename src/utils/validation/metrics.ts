import type { ValidationMeasurementId, ValidationSubject } from '../../types/validation';
import { compareAttempt, type MeasurementComparison, type ValidationSource } from './compare';
import { VALIDATION_MEASUREMENT_IDS } from './definitions';

/*
 * Summary error metrics over all recorded attempts, separately for each engine and for each measurement.
 *
 * A comparison counts as valid when the measurement was taped and the engine gave a value; it counts as
 * unavailable when it was taped and the engine gave none. Untaped measurements count as neither.
 */

export interface ErrorSummary {
  /** Valid comparisons (tape value and prediction both present). */
  count: number;
  /** Taped measurements the engine gave no value for. */
  unavailable: number;
  /** Mean absolute error (cm). Null without valid comparisons — never 0 by default. */
  maeCm: number | null;
  /** Mean signed error (bias, cm): positive = the scan measures larger than the tape. */
  biasCm: number | null;
  medianAbsCm: number | null;
  maxAbsCm: number | null;
}

export interface SourceSummary {
  /** All measurements pooled (cm errors of girths and lengths together). */
  overall: ErrorSummary;
  byMeasurement: Record<ValidationMeasurementId, ErrorSummary>;
}

export interface ValidationSummary {
  ellipse: SourceSummary;
  anny: SourceSummary;
  subjects: number;
  attempts: number;
  /** True when any synthetic (test) subject is included: such numbers say nothing about real-person accuracy. */
  includesSynthetic: boolean;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Summary of signed errors (cm) plus the number of unavailable predictions. */
export function summarizeErrors(signedErrors: readonly number[], unavailable: number): ErrorSummary {
  const n = signedErrors.length;
  const abs = signedErrors.map(Math.abs);
  return {
    count: n,
    unavailable,
    maeCm: n ? abs.reduce((s, v) => s + v, 0) / n : null,
    biasCm: n ? signedErrors.reduce((s, v) => s + v, 0) / n : null,
    medianAbsCm: median(abs),
    maxAbsCm: n ? Math.max(...abs) : null,
  };
}

function summarizeSource(rows: readonly MeasurementComparison[], source: ValidationSource): SourceSummary {
  const collect = (filter: (row: MeasurementComparison) => boolean) => {
    const taped = rows.filter((row) => row.truthCm !== null && filter(row));
    const errors = taped.flatMap((row) => (row[source].error ? [row[source].error.signedCm] : []));
    const unavailable = taped.filter((row) => row[source].unavailable).length;
    return summarizeErrors(errors, unavailable);
  };
  return {
    overall: collect(() => true),
    byMeasurement: Object.fromEntries(VALIDATION_MEASUREMENT_IDS.map((id) => [id, collect((row) => row.id === id)])) as Record<
      ValidationMeasurementId,
      ErrorSummary
    >,
  };
}

/** All comparisons of all attempts of the given subjects. */
export function allComparisons(subjects: readonly ValidationSubject[]): MeasurementComparison[] {
  return subjects.flatMap((subject) => subject.attempts.flatMap((attempt) => compareAttempt(subject, attempt)));
}

export function summarizeValidation(subjects: readonly ValidationSubject[]): ValidationSummary {
  const rows = allComparisons(subjects);
  return {
    ellipse: summarizeSource(rows, 'ellipse'),
    anny: summarizeSource(rows, 'anny'),
    subjects: subjects.length,
    attempts: subjects.reduce((n, s) => n + s.attempts.length, 0),
    includesSynthetic: subjects.some((s) => s.synthetic),
  };
}
