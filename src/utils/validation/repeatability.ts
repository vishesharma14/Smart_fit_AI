import type { ValidationMeasurementId, ValidationSubject } from '../../types/validation';
import type { ValidationSource } from './compare';
import { VALIDATION_LABELS, VALIDATION_MEASUREMENT_IDS } from './definitions';
import { mean, median } from './metrics';

/*
 * Repeatability: how much one engine's result changes between scans of the same subject (scan 1 vs scan 2,
 * scan 1 vs scan 3, …). These are differences between scans, not errors — a repeated scan is never treated as
 * ground truth, and agreement between scans says nothing about accuracy.
 */

export interface RepeatDifference {
  id: ValidationMeasurementId;
  label: string;
  baselineCm: number | null;
  repeatCm: number | null;
  /** Repeat − baseline (cm); null when either scan gave no value. */
  differenceCm: number | null;
}

export interface RepeatPair {
  baselineAttempt: number;
  repeatAttempt: number;
  ellipse: RepeatDifference[];
  anny: RepeatDifference[];
}

export interface RepeatSummary {
  /** Pairs where both scans gave a value. */
  count: number;
  meanAbsDifferenceCm: number | null;
  medianAbsDifferenceCm: number | null;
  maxAbsDifferenceCm: number | null;
}

export interface SubjectRepeatability {
  subjectId: string;
  pairs: RepeatPair[];
  /** Per engine and measurement, over all pairs. */
  summary: Record<ValidationSource, Record<ValidationMeasurementId, RepeatSummary>>;
}

/**
 * Compares the first usable scan (lowest attempt number) with each later usable one. Unusable attempts are skipped.
 * Null with fewer than 2 usable scans.
 */
export function subjectRepeatability(subject: ValidationSubject): SubjectRepeatability | null {
  const attempts = subject.attempts.filter((a) => a.usable).sort((a, b) => a.attempt - b.attempt);
  if (attempts.length < 2) return null;
  const [baseline, ...repeats] = attempts;
  const diff = (source: ValidationSource, repeat: (typeof attempts)[number]): RepeatDifference[] =>
    VALIDATION_MEASUREMENT_IDS.map((id) => {
      const baselineCm = baseline[source][id].valueCm;
      const repeatCm = repeat[source][id].valueCm;
      return {
        id,
        label: VALIDATION_LABELS[id],
        baselineCm,
        repeatCm,
        differenceCm: baselineCm !== null && repeatCm !== null ? repeatCm - baselineCm : null,
      };
    });
  const pairs = repeats.map((repeat) => ({
    baselineAttempt: baseline.attempt,
    repeatAttempt: repeat.attempt,
    ellipse: diff('ellipse', repeat),
    anny: diff('anny', repeat),
  }));
  const summarize = (source: ValidationSource) =>
    Object.fromEntries(
      VALIDATION_MEASUREMENT_IDS.map((id) => {
        const abs = pairs.flatMap((p) => {
          const d = p[source].find((row) => row.id === id)?.differenceCm;
          return d === null || d === undefined ? [] : [Math.abs(d)];
        });
        return [
          id,
          {
            count: abs.length,
            meanAbsDifferenceCm: mean(abs),
            medianAbsDifferenceCm: median(abs),
            maxAbsDifferenceCm: abs.length ? Math.max(...abs) : null,
          },
        ];
      }),
    ) as Record<ValidationMeasurementId, RepeatSummary>;
  return { subjectId: subject.subjectId, pairs, summary: { ellipse: summarize('ellipse'), anny: summarize('anny') } };
}
