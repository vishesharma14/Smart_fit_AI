import type { PoseLandmark } from '../../types/pose';

/*
 * Pure geometry on pose landmarks. Every function is deterministic and
 * returns null (never a guess) when an input is missing, not finite, or not
 * visible enough to trust.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isFinitePoint(point: Partial<Point3> | null | undefined): point is Point3 {
  return !!point && isFiniteNumber(point.x) && isFiniteNumber(point.y) && isFiniteNumber(point.z);
}

/** Straight-line (3D) distance between two points. */
export function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Midpoint of two points. */
export function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Length of a path through consecutive points (e.g. shoulder → elbow → wrist). */
export function pathLength(points: Point3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** numerator ÷ denominator, or null when the result would be meaningless (zero, tiny or non-finite denominator). */
export function ratio(numerator: number, denominator: number, epsilon = 1e-9): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || Math.abs(denominator) < epsilon) return null;
  return numerator / denominator;
}

/**
 * One landmark if it exists, has finite coordinates and the model's
 * visibility score reaches `minVisibility`; otherwise null.
 *
 * `positions` supplies the coordinates (e.g. 3D world landmarks) and
 * `visibilitySource` the visibility scores (the image landmarks of the same
 * capture), so 3D geometry is only used where the camera clearly saw the joint.
 */
export function visibleLandmark(
  positions: PoseLandmark[],
  visibilitySource: PoseLandmark[],
  index: number,
  minVisibility: number,
): PoseLandmark | null {
  const point = positions[index];
  const seen = visibilitySource[index];
  if (!isFinitePoint(point) || !seen || !isFiniteNumber(seen.visibility)) return null;
  return seen.visibility >= minVisibility ? point : null;
}

/** All requested landmarks (see visibleLandmark), or null if any is missing or not visible enough. */
export function visibleLandmarks(
  positions: PoseLandmark[],
  visibilitySource: PoseLandmark[],
  indices: readonly number[],
  minVisibility: number,
): PoseLandmark[] | null {
  const points: PoseLandmark[] = [];
  for (const index of indices) {
    const point = visibleLandmark(positions, visibilitySource, index, minVisibility);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

/** Lowest visibility score among the given landmarks (0 when any is missing). */
export function minVisibility(visibilitySource: PoseLandmark[], indices: readonly number[]): number {
  let lowest = 1;
  for (const index of indices) {
    const visibility = visibilitySource[index]?.visibility;
    if (!isFiniteNumber(visibility)) return 0;
    lowest = Math.min(lowest, visibility);
  }
  return Math.max(0, lowest);
}
