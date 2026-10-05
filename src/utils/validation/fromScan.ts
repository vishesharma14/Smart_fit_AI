import type { AnnyShadowState } from '../../hooks/useAnnyShadow';
import type { MeasurementReport } from '../../types/measurement';
import type { ScanCapture, ScanSessionStatus, ScanViewId } from '../../types/scan';
import type {
  ClothingFit,
  LightingCondition,
  RecordedAnnyInfo,
  RecordedPredictions,
  ScanPerformance,
  ValidationCameraType,
  ValidationDeviceType,
  ValidationScanAttempt,
  WornClothingType,
} from '../../types/validation';
import { measureScan } from '../measurement/measureScan';
import { SCAN_VIEWS } from '../scan360/views';
import { VALIDATION_MEASUREMENT_IDS } from './definitions';

/*
 * Builds a validation attempt from a finished scan: the production engine's values and the Anny shadow's values,
 * plus metadata. Only numbers and labels are copied — never the captures themselves (landmarks, outlines).
 */

/**
 * The production engine on the full body, so all eight compared measurements exist whatever garment is selected.
 * Same engine and formulas as the review page; only the region filter differs.
 */
export function measureForValidation(
  captures: Partial<Record<ScanViewId, ScanCapture>>,
  userHeightCm: number | null,
): MeasurementReport {
  return measureScan({ captures, region: 'full', userHeightCm });
}

export function recordEllipse(report: MeasurementReport): RecordedPredictions {
  return Object.fromEntries(
    VALIDATION_MEASUREMENT_IDS.map((id) => {
      const m = report.measurements.find((x) => x.id === id);
      if (!m) return [id, { valueCm: null, status: 'invalid', reason: 'not measured by the engine' }];
      if (m.value === null) return [id, { valueCm: null, status: m.status, reason: m.reason ?? 'no value' }];
      if (m.unit !== 'cm') return [id, { valueCm: null, status: m.status, reason: 'no real-world scale (model units)' }];
      return [id, { valueCm: m.value, status: m.status }];
    }),
  ) as RecordedPredictions;
}

const annyUnavailable = (reason: string): RecordedPredictions =>
  Object.fromEntries(VALIDATION_MEASUREMENT_IDS.map((id) => [id, { valueCm: null, status: 'unavailable', reason }])) as RecordedPredictions;

export function recordAnny(state: AnnyShadowState): { predictions: RecordedPredictions; info: RecordedAnnyInfo } {
  const empty = { rmsResidualCm: null, heightErrorCm: null, iterations: null, workerMs: null, modelLoadMs: null, fitMs: null, viewsUsed: [] };
  if (state.status === 'idle' || state.status === 'running')
    return { predictions: annyUnavailable('the Anny fit did not run'), info: { status: 'not-run', ...empty } };
  if (state.status === 'unavailable')
    return { predictions: annyUnavailable(state.reason), info: { status: 'unavailable', reason: state.reason, ...empty } };
  if (state.status === 'error')
    return { predictions: annyUnavailable(state.message), info: { status: 'error', reason: state.message, ...empty } };
  const { result } = state;
  const info: RecordedAnnyInfo = {
    status: result.status,
    ...(result.status === 'unavailable' ? { reason: result.reason } : {}),
    rmsResidualCm: result.fit?.rmsResidualCm ?? null,
    heightErrorCm: result.fit?.heightErrorCm ?? null,
    iterations: result.fit?.iterations ?? null,
    workerMs: Math.round(state.loadMs + state.fitMs),
    modelLoadMs: Math.round(state.loadMs),
    fitMs: Math.round(state.fitMs),
    viewsUsed: result.fit ? [...result.fit.viewsUsed] : [],
  };
  if (result.status === 'unavailable') return { predictions: annyUnavailable(result.reason), info };
  const predictions = Object.fromEntries(
    VALIDATION_MEASUREMENT_IDS.map((id) => {
      const value = result.measurements.find((m) => m.id === id)?.valueCm ?? null;
      return [id, value === null ? { valueCm: null, status: 'unavailable', reason: 'not measured on the fitted body' } : { valueCm: value, status: 'ok' }];
    }),
  ) as RecordedPredictions;
  return { predictions, info };
}

export interface ScanAttemptMeta {
  attempt: number;
  clothingType: WornClothingType;
  clothingFit: ClothingFit;
  deviceType: ValidationDeviceType;
  cameraType: ValidationCameraType;
  lighting: LightingCondition;
  browser: string;
  deviceDetails?: string;
}

/** Entered height may differ from the tape height by at most this much (cm) for the scan to be comparable. */
export const MAX_HEIGHT_MISMATCH_CM = 1;

/**
 * Whether a scan can be compared with the tape, and why not. An incomplete scan, a missing height or a height that
 * differs from the tape height (both engines scale by it) makes the attempt unusable; so does the tester's verdict.
 */
export function scanUsability(input: {
  scanStatus: ScanSessionStatus;
  viewsCaptured: number;
  enteredHeightCm: number | null;
  tapeHeightCm: number;
  testerReason?: string;
}): { usable: true } | { usable: false; reason: string } {
  const { scanStatus, viewsCaptured, enteredHeightCm, tapeHeightCm, testerReason } = input;
  if (scanStatus !== 'finished') return { usable: false, reason: `scan not finished (${viewsCaptured} of 8 views captured)` };
  if (enteredHeightCm === null) return { usable: false, reason: 'no height entered in the app' };
  if (Math.abs(enteredHeightCm - tapeHeightCm) > MAX_HEIGHT_MISMATCH_CM)
    return {
      usable: false,
      reason: `height entered in the app (${enteredHeightCm.toFixed(1)} cm) differs from the tape height (${tapeHeightCm.toFixed(1)} cm)`,
    };
  if (testerReason?.trim()) return { usable: false, reason: `marked unusable by the tester: ${testerReason.trim()}` };
  return { usable: true };
}

const allUnavailable = (status: 'invalid' | 'unavailable', reason: string): RecordedPredictions =>
  Object.fromEntries(VALIDATION_MEASUREMENT_IDS.map((id) => [id, { valueCm: null, status, reason }])) as RecordedPredictions;

/** First → last view capture time (ms), from the captures' own timestamps. */
export function firstToLastViewMs(captures: Partial<Record<ScanViewId, ScanCapture>>): number | null {
  const times = Object.values(captures).flatMap((c) => (c && Number.isFinite(c.capturedAt) ? [c.capturedAt] : []));
  return times.length >= 2 ? Math.max(...times) - Math.min(...times) : null;
}

export function buildScanAttempt(input: {
  meta: ScanAttemptMeta;
  /** Production engine on the full body; only computed for a usable scan. */
  measure: () => MeasurementReport;
  annyShadow: AnnyShadowState;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  scanStatus: ScanSessionStatus;
  finishedEarly: boolean;
  enteredHeightCm: number | null;
  tapeHeightCm: number;
  performance: ScanPerformance;
  testerUnusableReason?: string;
  now?: Date;
}): ValidationScanAttempt {
  const { meta, captures, scanStatus, enteredHeightCm, now = new Date() } = input;
  const viewsCaptured = SCAN_VIEWS.map((view) => view.id).filter((id) => captures[id]);
  const usability = scanUsability({
    scanStatus,
    viewsCaptured: viewsCaptured.length,
    enteredHeightCm,
    tapeHeightCm: input.tapeHeightCm,
    testerReason: input.testerUnusableReason,
  });
  const anny = recordAnny(scanStatus === 'finished' ? input.annyShadow : { status: 'idle' });
  const base = {
    ...meta,
    timestamp: now.toISOString(),
    scanStatus,
    finishedEarly: input.finishedEarly,
    performance: input.performance,
    enteredHeightCm,
    viewsCaptured,
    annyInfo: anny.info,
  };
  if (!usability.usable) {
    // Not converted into measurements: nothing is recorded as a value for an unusable scan.
    const reason = `unusable scan: ${usability.reason}`;
    return {
      ...base,
      usable: false,
      unusableReason: usability.reason,
      ellipse: allUnavailable('invalid', reason),
      ellipseCalibration: 'not measured',
      anny: allUnavailable('unavailable', reason),
    };
  }
  const report = input.measure();
  return {
    ...base,
    usable: true,
    ellipse: recordEllipse(report),
    ellipseCalibration: report.calibration.method,
    anny: anny.predictions,
  };
}
