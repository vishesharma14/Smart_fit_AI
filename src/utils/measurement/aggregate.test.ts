import { describe, expect, it } from 'vitest';
import {
  aggregateSamples,
  angleCoverage,
  combineConfidence,
  statusFromConfidence,
  weightedMedian,
  type AngleSample,
} from './aggregate';

const s = (angle: AngleSample['angle'], value: number, weight = 1): AngleSample => ({ angle, value, weight });

describe('weightedMedian', () => {
  it('is the ordinary median for equal weights', () => {
    expect(weightedMedian([{ value: 3, weight: 1 }, { value: 1, weight: 1 }, { value: 2, weight: 1 }])).toBe(2);
    expect(weightedMedian([{ value: 1, weight: 1 }, { value: 3, weight: 1 }])).toBe(2);
  });

  it('follows the weight', () => {
    expect(weightedMedian([{ value: 1, weight: 0.1 }, { value: 5, weight: 0.9 }])).toBe(5);
  });

  it('ignores unusable samples and returns null when none are left', () => {
    expect(weightedMedian([{ value: Number.NaN, weight: 1 }, { value: 4, weight: 0 }])).toBeNull();
    expect(weightedMedian([])).toBeNull();
  });
});

describe('aggregateSamples', () => {
  it('combines agreeing angles with full consistency', () => {
    const result = aggregateSamples([s('front', 0.4), s('back', 0.4)]);
    expect(result).toMatchObject({ value: 0.4, relativeSpread: 0, consistency: 1, meanWeight: 1, sampleCount: 2 });
    expect(result?.angles).toEqual(['front', 'back']);
  });

  it('lowers consistency as angles disagree, reaching 0 at the max spread', () => {
    const close = aggregateSamples([s('front', 1), s('back', 1.04)]);
    const far = aggregateSamples([s('front', 1), s('back', 1.6)]);
    expect(close!.consistency).toBeGreaterThan(0);
    expect(close!.consistency).toBeLessThan(1);
    expect(far!.consistency).toBe(0);
  });

  it('is robust to one outlier (median, not mean)', () => {
    const result = aggregateSamples([s('front', 0.5), s('left', 0.5), s('back', 0.5), s('right', 2)]);
    expect(result!.value).toBe(0.5);
  });

  it('gives a single sample only the fixed single-sample consistency', () => {
    expect(aggregateSamples([s('front', 0.4)])!.consistency).toBe(0.6);
    expect(aggregateSamples([s('front', 0.4)], { singleSampleConsistency: 0.3 })!.consistency).toBe(0.3);
  });

  it('lists each angle once', () => {
    expect(aggregateSamples([s('front', 0.5), s('front', 0.5), s('left', 0.5)])!.angles).toEqual(['front', 'left']);
  });

  it('reports the mean sample weight', () => {
    expect(aggregateSamples([s('front', 1, 0.8), s('back', 1, 0.6)])!.meanWeight).toBeCloseTo(0.7);
  });

  it('returns null for no usable samples', () => {
    expect(aggregateSamples([])).toBeNull();
    expect(aggregateSamples([s('front', 0), s('back', -1), s('left', Number.NaN), s('right', 1, 0)])).toBeNull();
  });

  it('is deterministic regardless of sample order', () => {
    const a = aggregateSamples([s('front', 0.41), s('back', 0.39, 0.7), s('left', 0.4, 0.9)]);
    const b = aggregateSamples([s('left', 0.4, 0.9), s('front', 0.41), s('back', 0.39, 0.7)]);
    expect(a!.value).toBe(b!.value);
    expect(a!.consistency).toBe(b!.consistency);
  });
});

describe('combineConfidence', () => {
  it('multiplies the factors', () => {
    expect(combineConfidence([0.5, 0.5])).toBe(0.25);
    expect(combineConfidence([1, 1, 1])).toBe(1);
  });

  it('clamps factors to 0–1 and treats invalid ones as 0', () => {
    expect(combineConfidence([2, 0.5])).toBe(0.5);
    expect(combineConfidence([-1, 0.5])).toBe(0);
    expect(combineConfidence([Number.NaN, 1])).toBe(0);
  });

  it('is 0 with no factors', () => {
    expect(combineConfidence([])).toBe(0);
  });
});

describe('angleCoverage', () => {
  it('is the share of expected angles', () => {
    expect(angleCoverage(2, 4)).toBe(0.5);
    expect(angleCoverage(4, 4)).toBe(1);
    expect(angleCoverage(1, 0)).toBe(0);
  });
});

describe('statusFromConfidence', () => {
  it('maps thresholds to statuses', () => {
    expect(statusFromConfidence(0.8, true)).toBe('valid');
    expect(statusFromConfidence(0.6, true)).toBe('valid');
    expect(statusFromConfidence(0.59, true)).toBe('uncertain');
    expect(statusFromConfidence(0.25, true)).toBe('uncertain');
    expect(statusFromConfidence(0.2, true)).toBe('invalid');
    expect(statusFromConfidence(Number.NaN, true)).toBe('invalid');
  });

  it('never marks an uncalibrated value valid', () => {
    expect(statusFromConfidence(1, false)).toBe('uncertain');
  });
});
