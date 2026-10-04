import type { AnnyCompactModel } from './format';
import { evaluateShape } from './model';
import { widthProfile, type EdgePoint } from './slice';

/*
 * Fits Anny shape coefficients to observed silhouette widths (Gauss–Newton with an analytic Jacobian).
 *
 * Residuals: model width − observed width for every view and height row, the model's stature − the entered
 * height (weighted), and a Gaussian prior on the coefficients (they are in standard-deviation units, so the
 * prior keeps the shape plausible when the outlines leave it under-determined).
 */

export interface AnnyFitView {
  /** Body angle of the view (0° facing the camera, turning left). */
  yawDeg: number;
  /** Observed width (metres) per row of `fractions`; null where not measurable. */
  widths: (number | null)[];
}

export interface AnnyFitInput {
  /** Entered height (metres). */
  heightM: number;
  /** Height fractions (0 = floor, 1 = head top) of the rows. */
  fractions: number[];
  views: AnnyFitView[];
}

export interface AnnyFitOptions {
  maxIterations?: number;
  /** Prior weight on the coefficients. */
  lambda?: number;
  /** Weight of the stature residual relative to one width row. */
  heightWeight?: number;
  /** Stop when the coefficient step (sd units) is smaller than this. */
  tolerance?: number;
}

export interface AnnyFit {
  coeffs: Float64Array;
  shape: Float32Array;
  iterations: number;
  converged: boolean;
  /** Root-mean-square width residual over the rows used (metres). */
  rmsResidual: number;
  /** Model stature − entered height (metres). */
  heightError: number;
  rowsUsed: number;
}

/** Solves A x = b (A n×n, row-major; modified in place) with partial pivoting. */
export function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let j = i + 1; j < n; j += 1) if (Math.abs(A[j * n + i]) > Math.abs(A[pivot * n + i])) pivot = j;
    if (pivot !== i) {
      for (let k = 0; k < n; k += 1) [A[i * n + k], A[pivot * n + k]] = [A[pivot * n + k], A[i * n + k]];
      [b[i], b[pivot]] = [b[pivot], b[i]];
    }
    const d = A[i * n + i] || 1e-12;
    for (let j = i + 1; j < n; j += 1) {
      const factor = A[j * n + i] / d;
      if (!factor) continue;
      for (let k = i; k < n; k += 1) A[j * n + k] -= factor * A[i * n + k];
      b[j] -= factor * b[i];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = b[i];
    for (let k = i + 1; k < n; k += 1) s -= A[i * n + k] * x[k];
    x[i] = s / (A[i * n + i] || 1e-12);
  }
  return x;
}

export function fitAnny(model: AnnyCompactModel, input: AnnyFitInput, options: AnnyFitOptions = {}): AnnyFit {
  const { maxIterations = 20, lambda = 0.02, heightWeight = 5, tolerance = 1e-3 } = options;
  const K = model.components;
  const { stride, basis, sd } = model;
  const yaws = input.views.map((v) => v.yawDeg);
  const coeffs = new Float64Array(K);
  const shape = new Float32Array(stride);
  const JTJ = new Float64Array(K * K);
  const JTr = new Float64Array(K);
  const row = new Float64Array(K);
  // Derivative of a component's x/y at an edge point.
  const edgeXY = (offset: number, e: EdgePoint, axis: 0 | 1) =>
    (1 - e.t) * basis[offset + 3 * e.p + axis] + e.t * basis[offset + 3 * e.q + axis];

  let iterations = 0;
  let converged = false;
  let rmsResidual = Number.NaN;
  let heightError = Number.NaN;
  let rowsUsed = 0;
  for (; iterations < maxIterations; iterations += 1) {
    evaluateShape(model, coeffs, shape);
    const profile = widthProfile(model, shape, yaws, input.fractions);
    JTJ.fill(0);
    JTr.fill(0);
    let sq = 0;
    rowsUsed = 0;
    const accumulate = (residual: number) => {
      for (let a = 0; a < K; a += 1) {
        JTr[a] += row[a] * residual;
        for (let b = 0; b < K; b += 1) JTJ[a * K + b] += row[a] * row[b];
      }
    };
    input.views.forEach((view, v) => {
      const [dx, dy] = profile.directions[v];
      const pv = profile.views[v];
      for (let r = 0; r < input.fractions.length; r += 1) {
        const observed = view.widths[r];
        const modelled = pv.widths[r];
        const hi = pv.high[r];
        const lo = pv.low[r];
        if (observed === null || !Number.isFinite(observed) || !Number.isFinite(modelled) || !hi || !lo) continue;
        for (let k = 0; k < K; k += 1) {
          const o = k * stride;
          row[k] = sd[k] * ((edgeXY(o, hi, 0) - edgeXY(o, lo, 0)) * dx + (edgeXY(o, hi, 1) - edgeXY(o, lo, 1)) * dy);
        }
        const residual = modelled - observed;
        sq += residual * residual;
        rowsUsed += 1;
        accumulate(residual);
      }
    });
    rmsResidual = rowsUsed ? Math.sqrt(sq / rowsUsed) : Number.NaN;
    heightError = profile.stature - input.heightM;
    for (let k = 0; k < K; k += 1) {
      const o = k * stride;
      row[k] = heightWeight * sd[k] * (basis[o + 3 * profile.topIndex + 2] - basis[o + 3 * profile.floorIndex + 2]);
    }
    accumulate(heightWeight * heightError);
    if (rowsUsed === 0) break;
    for (let k = 0; k < K; k += 1) {
      JTJ[k * K + k] += lambda;
      JTr[k] += lambda * coeffs[k];
    }
    const step = solveLinear(JTJ, JTr.map((x) => -x), K);
    let norm = 0;
    for (let k = 0; k < K; k += 1) {
      coeffs[k] += step[k];
      norm += step[k] * step[k];
    }
    if (Math.sqrt(norm) < tolerance) {
      converged = true;
      iterations += 1;
      break;
    }
  }
  // Final state for the reported residuals.
  evaluateShape(model, coeffs, shape);
  if (rowsUsed > 0) {
    const profile = widthProfile(model, shape, yaws, input.fractions);
    let sq = 0;
    let n = 0;
    input.views.forEach((view, v) => {
      for (let r = 0; r < input.fractions.length; r += 1) {
        const observed = view.widths[r];
        const modelled = profile.views[v].widths[r];
        if (observed === null || !Number.isFinite(observed) || !Number.isFinite(modelled)) continue;
        sq += (modelled - observed) ** 2;
        n += 1;
      }
    });
    rmsResidual = n ? Math.sqrt(sq / n) : Number.NaN;
    rowsUsed = n;
    heightError = profile.stature - input.heightM;
  }
  return { coeffs, shape, iterations, converged, rmsResidual, heightError, rowsUsed };
}
