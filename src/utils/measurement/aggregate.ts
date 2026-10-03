import type { MeasurementStatus } from '../../types/measurement';
import type { ScanPhaseId } from '../../types/scan';

/*
 * Combining one measurement's samples from several captured angles, and the
 * confidence rules. Deterministic: same samples in, same result out.
 */

/** One measurement taken from one captured angle (e.g. the left arm in the front view). */
export interface AngleSample {
  angle: ScanPhaseId;
  /** In world-landmark units (before calibration). */
  value: number;
  /** 0–1 quality of this sample (the lowest visibility of the landmarks it used). */
  weight: number;
}

export interface AggregateResult {
  /** Weighted median of the samples. */
  value: number;
  /** Weighted mean absolute deviation from `value`, relative to `value` (0 = all samples agree). */
  relativeSpread: number;
  /** 0–1 agreement between samples (1 = identical; 0 at or beyond `maxRelativeSpread`). */
  consistency: number;
  /** Mean sample weight (0–1). */
  meanWeight: number;
  sampleCount: number;
  angles: ScanPhaseId[];
}

export interface AggregateOptions {
  /** Relative spread at which consistency reaches 0. */
  maxRelativeSpread?: number;
  /**
   * Consistency given to a single sample: agreement can't be checked, so it
   * is never treated as fully confirmed.
   */
  singleSampleConsistency?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Weighted median: the value at which half of the total weight lies on each side. */
export function weightedMedian(samples: { value: number; weight: number }[]): number | null {
  const usable = samples.filter((s) => Number.isFinite(s.value) && Number.isFinite(s.weight) && s.weight > 0);
  if (usable.length === 0) return null;
  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((sum, s) => sum + s.weight, 0) / 2;
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i].weight;
    if (cumulative > half) return sorted[i].value;
    // Exactly half: average with the next value, like an ordinary median of an even count.
    if (cumulative === half && i + 1 < sorted.length) return (sorted[i].value + sorted[i + 1].value) / 2;
  }
  return sorted[sorted.length - 1].value;
}

/**
 * Combines samples from several angles. Returns null when there is nothing
 * usable (no samples, or only non-finite / zero-weight / non-positive values).
 */
export function aggregateSamples(samples: AngleSample[], options: AggregateOptions = {}): AggregateResult | null {
  const { maxRelativeSpread = 0.15, singleSampleConsistency = 0.6 } = options;
  const usable = samples.filter((s) => Number.isFinite(s.value) && s.value > 0 && Number.isFinite(s.weight) && s.weight > 0);
  if (usable.length === 0) return null;

  const value = weightedMedian(usable);
  if (value === null || value <= 0) return null;
  const totalWeight = usable.reduce((sum, s) => sum + s.weight, 0);
  const meanAbsDeviation = usable.reduce((sum, s) => sum + s.weight * Math.abs(s.value - value), 0) / totalWeight;
  const relativeSpread = meanAbsDeviation / value;
  const consistency =
    usable.length === 1 ? clamp01(singleSampleConsistency) : clamp01(1 - relativeSpread / maxRelativeSpread);

  const angles: ScanPhaseId[] = [];
  for (const sample of usable) if (!angles.includes(sample.angle)) angles.push(sample.angle);

  return {
    value,
    relativeSpread,
    consistency,
    meanWeight: clamp01(totalWeight / usable.length),
    sampleCount: usable.length,
    angles,
  };
}

/**
 * Overall confidence from independent 0–1 factors (e.g. visibility,
 * agreement, angle coverage, calibration). Multiplying means any weak factor
 * pulls the result down; a missing/invalid factor counts as 0.
 */
export function combineConfidence(factors: number[]): number {
  if (factors.length === 0) return 0;
  return factors.reduce((product, factor) => product * (Number.isFinite(factor) ? clamp01(factor) : 0), 1);
}

/** Share of the expected angles that contributed (1 when all did). */
export function angleCoverage(contributing: number, expected: number): number {
  if (expected <= 0) return 0;
  return clamp01(contributing / expected);
}

export const CONFIDENCE_THRESHOLDS = {
  /** At or above: `valid` (when calibrated). */
  valid: 0.6,
  /** At or above (and below `valid`): `uncertain`. Below: `invalid`. */
  uncertain: 0.25,
} as const;

/** Status for a computed measurement from its confidence. Uncalibrated values are never `valid`. */
export function statusFromConfidence(confidence: number, calibrated: boolean): MeasurementStatus {
  if (!Number.isFinite(confidence) || confidence < CONFIDENCE_THRESHOLDS.uncertain) return 'invalid';
  if (confidence >= CONFIDENCE_THRESHOLDS.valid && calibrated) return 'valid';
  return 'uncertain';
}
