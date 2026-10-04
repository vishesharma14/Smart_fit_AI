import type { ValidationMeasurementGroup, ValidationMeasurementId, ValidationSubject } from '../../types/validation';
import { compareAttempt, type MeasurementComparison, type ValidationSource } from './compare';
import { VALIDATION_GROUP, VALIDATION_GROUPS, VALIDATION_MEASUREMENT_IDS } from './definitions';

/*
 * Summary error metrics over the usable recorded attempts, separately for each engine, for each measurement, and
 * for circumferences and lengths (never one figure for everything).
 *
 * A comparison counts as valid when the measurement was taped and the engine gave a value; it counts as
 * unavailable when it was taped and the engine gave none. Untaped measurements count as neither. Unusable
 * (incomplete / invalid) attempts are counted separately and contribute no errors.
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
  byMeasurement: Record<ValidationMeasurementId, ErrorSummary>;
  /** Circumferences and lengths pooled separately (cm errors of different kinds of measurement are never mixed). */
  byGroup: Record<ValidationMeasurementGroup, ErrorSummary>;
}

export interface ValidationSummary {
  ellipse: SourceSummary;
  anny: SourceSummary;
  subjects: number;
  /** Subjects with at least one usable scan. */
  subjectsWithUsableScans: number;
  usableAttempts: number;
  unusableAttempts: number;
  /** True when any synthetic (test) subject is included: such numbers say nothing about real-person accuracy. */
  includesSynthetic: boolean;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const mean = (values: readonly number[]): number | null =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

/** Summary of signed errors (cm) plus the number of unavailable predictions. */
export function summarizeErrors(signedErrors: readonly number[], unavailable: number): ErrorSummary {
  const n = signedErrors.length;
  const abs = signedErrors.map(Math.abs);
  return {
    count: n,
    unavailable,
    maeCm: mean(abs),
    biasCm: mean(signedErrors),
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
    byMeasurement: Object.fromEntries(VALIDATION_MEASUREMENT_IDS.map((id) => [id, collect((row) => row.id === id)])) as Record<
      ValidationMeasurementId,
      ErrorSummary
    >,
    byGroup: Object.fromEntries(
      VALIDATION_GROUPS.map((group) => [group, collect((row) => VALIDATION_GROUP[row.id] === group)]),
    ) as Record<ValidationMeasurementGroup, ErrorSummary>,
  };
}

/** Comparisons of all usable attempts of the given subjects. */
export function allComparisons(subjects: readonly ValidationSubject[]): MeasurementComparison[] {
  return subjects.flatMap((subject) =>
    subject.attempts.filter((attempt) => attempt.usable).flatMap((attempt) => compareAttempt(subject, attempt)),
  );
}

export function summarizeValidation(subjects: readonly ValidationSubject[]): ValidationSummary {
  const rows = allComparisons(subjects);
  const attempts = subjects.flatMap((s) => s.attempts);
  return {
    ellipse: summarizeSource(rows, 'ellipse'),
    anny: summarizeSource(rows, 'anny'),
    subjects: subjects.length,
    subjectsWithUsableScans: subjects.filter((s) => s.attempts.some((a) => a.usable)).length,
    usableAttempts: attempts.filter((a) => a.usable).length,
    unusableAttempts: attempts.filter((a) => !a.usable).length,
    includesSynthetic: subjects.some((s) => s.synthetic),
  };
}

export interface AnnyReliability {
  /** Usable scans considered. */
  scans: number;
  ok: number;
  /** The reliability gate rejected the fit, or the scan had too little outline data. */
  unavailable: number;
  error: number;
  notRun: number;
  /** (unavailable + error + not run) ÷ scans; null without scans. */
  rejectionRate: number | null;
  reasons: { reason: string; count: number }[];
  /** Over scans whose fit ran (cm / ms). */
  meanFitErrorCm: number | null;
  meanAbsHeightErrorCm: number | null;
  meanWorkerMs: number | null;
}

/** How often the Anny shadow produced a result on usable scans, and why not. A passing fit is not proof of accuracy. */
export function annyReliability(subjects: readonly ValidationSubject[]): AnnyReliability {
  const infos = subjects.flatMap((s) => s.attempts.filter((a) => a.usable).map((a) => a.annyInfo));
  const count = (status: string) => infos.filter((i) => i.status === status).length;
  const reasons = new Map<string, number>();
  for (const info of infos) if (info.status !== 'ok') reasons.set(info.reason ?? info.status, (reasons.get(info.reason ?? info.status) ?? 0) + 1);
  const numbers = (pick: (i: (typeof infos)[number]) => number | null) =>
    infos.flatMap((i) => {
      const v = pick(i);
      return v === null || !Number.isFinite(v) ? [] : [v];
    });
  const ok = count('ok');
  return {
    scans: infos.length,
    ok,
    unavailable: count('unavailable'),
    error: count('error'),
    notRun: count('not-run'),
    rejectionRate: infos.length ? (infos.length - ok) / infos.length : null,
    reasons: [...reasons].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count),
    meanFitErrorCm: mean(numbers((i) => i.rmsResidualCm)),
    meanAbsHeightErrorCm: mean(numbers((i) => (i.heightErrorCm === null ? null : Math.abs(i.heightErrorCm)))),
    meanWorkerMs: mean(numbers((i) => i.workerMs)),
  };
}
