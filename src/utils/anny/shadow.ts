import type { MeasurementReport, MeasurementStatus } from '../../types/measurement';
import type { ScanViewId } from '../../types/scan';
import { fitAnny, type AnnyFitInput } from './fit';
import type { AnnyCompactModel } from './format';
import { measureAnnyBody, type ShadowMeasurement, type ShadowMeasurementId } from './measure';

/*
 * Anny shadow measurements (Step 9E-2): fit the body model to the scan's outlines and measure the fitted body,
 * for comparison with the production (ellipse) engine in `?poseDebug` only. Never used for final measurements,
 * size prediction or saved data. An unreliable fit yields `unavailable` with a reason — never a value.
 */

/** Fit acceptance limits. */
export const ANNY_SHADOW_LIMITS = {
  /** RMS width residual above which the model does not explain the outlines (metres). */
  maxRmsResidual: 0.02,
  /** Stature mismatch above which the scale is not trusted (metres). */
  maxHeightError: 0.015,
  /** A coefficient beyond this many standard deviations is outside the sampled body range. */
  maxCoefficient: 3.5,
} as const;

export interface AnnyShadowFitInfo {
  iterations: number;
  converged: boolean;
  rmsResidualCm: number;
  heightErrorCm: number;
  rowsUsed: number;
  viewsUsed: ScanViewId[];
}

export type AnnyShadowResult =
  | { status: 'ok'; confidence: 'experimental'; measurements: ShadowMeasurement[]; fit: AnnyShadowFitInfo }
  | { status: 'unavailable'; reason: string; fit: AnnyShadowFitInfo | null };

export function runAnnyShadow(model: AnnyCompactModel, input: AnnyFitInput, viewsUsed: ScanViewId[]): AnnyShadowResult {
  const fit = fitAnny(model, input);
  const info: AnnyShadowFitInfo = {
    iterations: fit.iterations,
    converged: fit.converged,
    rmsResidualCm: Math.round(fit.rmsResidual * 1000) / 10,
    heightErrorCm: Math.round(fit.heightError * 1000) / 10,
    rowsUsed: fit.rowsUsed,
    viewsUsed,
  };
  const unavailable = (reason: string): AnnyShadowResult => ({ status: 'unavailable', reason, fit: info });
  if (fit.rowsUsed === 0 || !Number.isFinite(fit.rmsResidual)) return unavailable('no outline rows to fit');
  if (fit.rmsResidual > ANNY_SHADOW_LIMITS.maxRmsResidual) return unavailable('the body model could not match the outlines closely enough');
  if (Math.abs(fit.heightError) > ANNY_SHADOW_LIMITS.maxHeightError) return unavailable('the fitted height does not match the entered height');
  if (fit.coeffs.some((c) => Math.abs(c) > ANNY_SHADOW_LIMITS.maxCoefficient)) return unavailable('the fitted shape is outside the body model’s sampled range');
  return { status: 'ok', confidence: 'experimental', measurements: measureAnnyBody(model, fit.shape), fit: info };
}

export interface ShadowComparison {
  id: ShadowMeasurementId;
  label: string;
  /** Production engine value (cm) and status; null when the engine gave none or did not measure it for this garment. */
  engineCm: number | null;
  engineStatus: MeasurementStatus | null;
  annyCm: number | null;
  /** Anny − engine (cm), when both exist. */
  differenceCm: number | null;
}

/** Side-by-side rows for the developer panel. */
export function compareWithEngine(report: MeasurementReport | null, shadow: AnnyShadowResult | null): ShadowComparison[] {
  const ids: [ShadowMeasurementId, string][] = [
    ['chest', 'Chest'],
    ['waist', 'Waist'],
    ['hip', 'Hip'],
    ['thigh', 'Thigh'],
    ['inseam', 'Inseam'],
    ['shoulder-width', 'Shoulder width'],
    ['arm-length', 'Arm length'],
    ['leg-length', 'Leg length'],
  ];
  return ids.map(([id, label]) => {
    const engine = report?.measurements.find((m) => m.id === id) ?? null;
    const engineCm = engine && engine.unit === 'cm' ? engine.value : null;
    const anny = shadow?.status === 'ok' ? (shadow.measurements.find((m) => m.id === id)?.valueCm ?? null) : null;
    return {
      id,
      label,
      engineCm,
      engineStatus: engine?.status ?? null,
      annyCm: anny,
      differenceCm: engineCm !== null && anny !== null ? Math.round((anny - engineCm) * 10) / 10 : null,
    };
  });
}
