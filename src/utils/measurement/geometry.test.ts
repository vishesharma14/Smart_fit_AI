import { describe, expect, it } from 'vitest';
import { distance, isFinitePoint, midpoint, minVisibility, pathLength, ratio, visibleLandmark, visibleLandmarks } from './geometry';

const p = (x: number, y: number, z = 0, visibility = 1) => ({ x, y, z, visibility });

describe('distance', () => {
  it('is the 3D straight-line distance', () => {
    expect(distance(p(0, 0), p(3, 4))).toBe(5);
    expect(distance(p(1, 2, 3), p(1, 2, 3))).toBe(0);
    expect(distance(p(0, 0, 0), p(2, 3, 6))).toBe(7);
  });

  it('is symmetric', () => {
    expect(distance(p(1, -2, 0.5), p(-3, 4, 2))).toBe(distance(p(-3, 4, 2), p(1, -2, 0.5)));
  });
});

describe('midpoint', () => {
  it('averages each coordinate', () => {
    expect(midpoint(p(0, 0, 0), p(2, -4, 6))).toEqual({ x: 1, y: -2, z: 3 });
  });
});

describe('pathLength', () => {
  it('sums consecutive segments', () => {
    expect(pathLength([p(0, 0), p(3, 4), p(3, 10)])).toBe(11);
  });

  it('is 0 for fewer than two points', () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([p(1, 1)])).toBe(0);
  });
});

describe('ratio', () => {
  it('divides finite values', () => {
    expect(ratio(1, 4)).toBe(0.25);
  });

  it('returns null for a zero, tiny or non-finite denominator', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 1e-12)).toBeNull();
    expect(ratio(1, Number.NaN)).toBeNull();
    expect(ratio(Number.POSITIVE_INFINITY, 2)).toBeNull();
  });
});

describe('isFinitePoint', () => {
  it('rejects missing and non-finite coordinates', () => {
    expect(isFinitePoint(p(0, 0))).toBe(true);
    expect(isFinitePoint(null)).toBe(false);
    expect(isFinitePoint(undefined)).toBe(false);
    expect(isFinitePoint({ x: 0, y: Number.NaN, z: 0 })).toBe(false);
    expect(isFinitePoint({ x: 0, y: 0 })).toBe(false);
  });
});

describe('visibleLandmark / visibleLandmarks', () => {
  const positions = [p(0, 0), p(1, 0), { x: Number.NaN, y: 0, z: 0, visibility: 1 }];
  const seen = [p(0, 0, 0, 0.9), p(0, 0, 0, 0.3), p(0, 0, 0, 0.9)];

  it('returns the position when visible enough', () => {
    expect(visibleLandmark(positions, seen, 0, 0.6)).toBe(positions[0]);
  });

  it('returns null below the visibility threshold', () => {
    expect(visibleLandmark(positions, seen, 1, 0.6)).toBeNull();
  });

  it('returns null for missing or non-finite landmarks', () => {
    expect(visibleLandmark(positions, seen, 2, 0.6)).toBeNull();
    expect(visibleLandmark(positions, seen, 7, 0.6)).toBeNull();
    expect(visibleLandmark([], [], 0, 0)).toBeNull();
  });

  it('returns null for a missing visibility score', () => {
    expect(visibleLandmark(positions, [{ x: 0, y: 0, z: 0, visibility: Number.NaN }], 0, 0)).toBeNull();
  });

  it('requires every listed landmark', () => {
    expect(visibleLandmarks(positions, seen, [0], 0.6)).toEqual([positions[0]]);
    expect(visibleLandmarks(positions, seen, [0, 1], 0.6)).toBeNull();
  });
});

describe('minVisibility', () => {
  it('is the lowest score, or 0 when a landmark is missing', () => {
    const seen = [p(0, 0, 0, 0.9), p(0, 0, 0, 0.7)];
    expect(minVisibility(seen, [0, 1])).toBe(0.7);
    expect(minVisibility(seen, [0, 5])).toBe(0);
  });
});
