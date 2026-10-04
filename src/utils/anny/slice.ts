import type { AnnyCompactModel } from './format';
import { verticalExtent } from './model';

/*
 * Horizontal slices through the body mesh: exact triangle/plane intersections.
 *
 * - `widthProfile`: the body's projected width per view and height (what a silhouette shows), with the edge
 *   each extreme point lies on, so the fitter can differentiate it.
 * - `sliceCircumference`: a tape-like circumference — the convex hull perimeter of a slice, as a tape bridges
 *   concave parts of the body.
 */

/** Which triangles a slice includes. */
export type TriangleFilter = 'torso' | 'leftLeg' | 'rightLeg';

/** A triangle belongs to the torso unless most of its vertices are arm vertices (arms are masked out). */
export function triangleIncluded(model: AnnyCompactModel, face: number, filter: TriangleFilter): boolean {
  const { faces } = model;
  const mask = filter === 'torso' ? model.armMask : filter === 'leftLeg' ? model.leftLegMask : model.rightLegMask;
  const count = mask[faces[3 * face]] + mask[faces[3 * face + 1]] + mask[faces[3 * face + 2]];
  return filter === 'torso' ? count < 2 : count >= 2;
}

/** Point where the edge p→q crosses height z, as the two vertices and the interpolation factor. */
export interface EdgePoint {
  p: number;
  q: number;
  t: number;
}

export interface ViewProfile {
  /** Width per height row (metres); NaN where the slice is empty. */
  widths: Float64Array;
  /** Extreme points per row (for the Jacobian). */
  high: (EdgePoint | null)[];
  low: (EdgePoint | null)[];
}

export interface WidthProfile {
  stature: number;
  floorZ: number;
  floorIndex: number;
  topIndex: number;
  views: ViewProfile[];
  /** Projection direction (in the x/y plane) of each view. */
  directions: [number, number][];
}

/**
 * Projection direction for a body angle (0° facing the camera, turning left). The camera's horizontal axis
 * expressed in body coordinates; for a left/right-symmetric body the sign of the turn does not change widths.
 */
export function viewDirection(yawDeg: number): [number, number] {
  const r = (yawDeg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

/**
 * Projected width of the torso (arms masked) at each height fraction (0 = floor, 1 = head top) for each view.
 */
export function widthProfile(model: AnnyCompactModel, shape: Float32Array, yawsDeg: number[], fractions: number[]): WidthProfile {
  const ext = verticalExtent(model, shape);
  const stature = ext.max - ext.min;
  const directions = yawsDeg.map(viewDirection);
  const rows = fractions.length;
  const views: ViewProfile[] = yawsDeg.map(() => ({
    widths: new Float64Array(rows).fill(Number.NaN),
    high: new Array(rows).fill(null),
    low: new Array(rows).fill(null),
  }));
  const lo = yawsDeg.map(() => new Float64Array(rows).fill(Infinity));
  const hi = yawsDeg.map(() => new Float64Array(rows).fill(-Infinity));
  const heights = fractions.map((f) => ext.min + f * stature);
  const fMin = Math.min(...fractions);
  const fMax = Math.max(...fractions);
  const { faces } = model;
  for (let f = 0; f < model.faceCount; f += 1) {
    if (!triangleIncluded(model, f, 'torso')) continue;
    const i0 = faces[3 * f];
    const i1 = faces[3 * f + 1];
    const i2 = faces[3 * f + 2];
    const z0 = shape[3 * i0 + 2];
    const z1 = shape[3 * i1 + 2];
    const z2 = shape[3 * i2 + 2];
    const zLow = Math.min(z0, z1, z2);
    const zHigh = Math.max(z0, z1, z2);
    if ((zHigh - ext.min) / stature < fMin || (zLow - ext.min) / stature > fMax) continue;
    for (let r = 0; r < rows; r += 1) {
      const z = heights[r];
      if (z < zLow || z > zHigh) continue;
      for (const [p, q] of [
        [i0, i1],
        [i1, i2],
        [i2, i0],
      ]) {
        const zp = shape[3 * p + 2];
        const zq = shape[3 * q + 2];
        if ((zp - z) * (zq - z) > 0 || zp === zq) continue;
        const t = (z - zp) / (zq - zp);
        const x = shape[3 * p] + t * (shape[3 * q] - shape[3 * p]);
        const y = shape[3 * p + 1] + t * (shape[3 * q + 1] - shape[3 * p + 1]);
        for (let v = 0; v < yawsDeg.length; v += 1) {
          const u = x * directions[v][0] + y * directions[v][1];
          if (u < lo[v][r]) {
            lo[v][r] = u;
            views[v].low[r] = { p, q, t };
          }
          if (u > hi[v][r]) {
            hi[v][r] = u;
            views[v].high[r] = { p, q, t };
          }
        }
      }
    }
  }
  views.forEach((view, v) => {
    for (let r = 0; r < rows; r += 1) if (view.high[r]) view.widths[r] = hi[v][r] - lo[v][r];
  });
  return { stature, floorZ: ext.min, floorIndex: ext.minIndex, topIndex: ext.maxIndex, views, directions };
}

/** Intersection points (x, y) of the included triangles with the plane at height z. */
export function slicePoints(model: AnnyCompactModel, shape: Float32Array, z: number, filter: TriangleFilter): [number, number][] {
  const points: [number, number][] = [];
  const { faces } = model;
  for (let f = 0; f < model.faceCount; f += 1) {
    const idx = [faces[3 * f], faces[3 * f + 1], faces[3 * f + 2]];
    const zs = idx.map((i) => shape[3 * i + 2]);
    if (z < Math.min(...zs) || z > Math.max(...zs)) continue;
    if (!triangleIncluded(model, f, filter)) continue;
    for (let e = 0; e < 3; e += 1) {
      const p = idx[e];
      const q = idx[(e + 1) % 3];
      const zp = shape[3 * p + 2];
      const zq = shape[3 * q + 2];
      if ((zp - z) * (zq - z) > 0 || zp === zq) continue;
      const t = (z - zp) / (zq - zp);
      points.push([shape[3 * p] + t * (shape[3 * q] - shape[3 * p]), shape[3 * p + 1] + t * (shape[3 * q + 1] - shape[3 * p + 1])]);
    }
  }
  return points;
}

/** Perimeter of the convex hull of 2D points (monotone chain); 0 for fewer than 3 points. */
export function convexHullPerimeter(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let perimeter = 0;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    perimeter += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return perimeter;
}

/** Tape-like circumference (metres) of the included triangles at height z. */
export function sliceCircumference(model: AnnyCompactModel, shape: Float32Array, z: number, filter: TriangleFilter): number {
  return convexHullPerimeter(slicePoints(model, shape, z, filter));
}
