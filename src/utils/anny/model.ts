import { ANNY_JOINTS, type AnnyCompactModel, type AnnyJoint } from './format';

/*
 * Body shape evaluation: shape vector = mean + Σ coefficient_k · sd_k · basis_k (vertices then joints,
 * metres). Linear, so it is cheap to evaluate and differentiate in plain TypeScript.
 */

export type Vec3 = [number, number, number];

/** Evaluates a shape (coefficients in standard-deviation units; missing ones count as 0). */
export function evaluateShape(model: AnnyCompactModel, coeffs: ArrayLike<number>, out?: Float32Array): Float32Array {
  const { stride, mean, basis, sd } = model;
  const shape = out ?? new Float32Array(stride);
  shape.set(mean);
  const k = Math.min(coeffs.length, model.components);
  for (let c = 0; c < k; c += 1) {
    const s = coeffs[c] * sd[c];
    if (!s) continue;
    const offset = c * stride;
    for (let i = 0; i < stride; i += 1) shape[i] += s * basis[offset + i];
  }
  return shape;
}

export function vertex(shape: Float32Array, index: number): Vec3 {
  return [shape[3 * index], shape[3 * index + 1], shape[3 * index + 2]];
}

export function joint(model: AnnyCompactModel, shape: Float32Array, name: AnnyJoint): Vec3 {
  return vertex(shape, model.vertexCount + ANNY_JOINTS.indexOf(name));
}

/** Lowest and highest vertex heights (floor contact and head top). */
export function verticalExtent(model: AnnyCompactModel, shape: Float32Array): { min: number; max: number; minIndex: number; maxIndex: number } {
  let min = Infinity;
  let max = -Infinity;
  let minIndex = 0;
  let maxIndex = 0;
  for (let i = 0; i < model.vertexCount; i += 1) {
    const z = shape[3 * i + 2];
    if (z < min) {
      min = z;
      minIndex = i;
    }
    if (z > max) {
      max = z;
      maxIndex = i;
    }
  }
  return { min, max, minIndex, maxIndex };
}

export const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
