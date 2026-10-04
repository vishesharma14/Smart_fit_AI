import type { MeasurementId, MeasurementStatus } from './measurement';
import type { ScanSessionStatus, ScanViewId } from './scan';

/*
 * Real-person validation records (Step 9E-3A, developer view only).
 *
 * One anonymous test subject: their manual tape measurements (the ground truth) and the scan attempts made of
 * them, each keeping only the measurement values both engines produced plus scan metadata. No photos, camera
 * frames, landmarks, outlines or segmentation masks are ever part of a record. Records live in memory only.
 */

/** The eight measurements that are compared (the ones both the ellipse engine and the Anny shadow produce). */
export type ValidationMeasurementId = Extract<
  MeasurementId,
  'chest' | 'waist' | 'hip' | 'thigh' | 'inseam' | 'shoulder-width' | 'arm-length' | 'leg-length'
>;

/** One manual tape measurement. Entered by a person measuring the subject; never generated. */
export interface TapeMeasurement {
  name: ValidationMeasurementId;
  value: number;
  unit: 'cm';
  notes?: string;
}

export type ClothingFit = 'fitted' | 'normal' | 'loose';

/** Body side a one-sided tape measurement was taken on (keep it the same for repeated scans). */
export type MeasuringSide = 'left' | 'right';

/** Circumferences and lengths are always reported separately, never as one combined accuracy figure. */
export type ValidationMeasurementGroup = 'circumference' | 'length';

/** What the subject wore during the scan. */
export type WornClothingType =
  | 'activewear'
  | 't-shirt-shorts'
  | 't-shirt-trousers'
  | 'shirt-trousers'
  | 'dress-skirt'
  | 'other';

export type ValidationDeviceType = 'phone' | 'tablet' | 'laptop' | 'desktop';
export type ValidationCameraType = 'rear' | 'front' | 'webcam' | 'external';
export type LightingCondition = 'bright-even' | 'normal-indoor' | 'dim' | 'backlit' | 'mixed';

/** One engine's value for one measurement in one scan; null when the engine gave none. */
export interface RecordedPrediction {
  valueCm: number | null;
  /** Ellipse: the engine's status. Anny: 'ok' or 'unavailable'. */
  status: MeasurementStatus | 'ok' | 'unavailable';
  /** Why there is no value (when `valueCm` is null). */
  reason?: string;
}

export type RecordedPredictions = Record<ValidationMeasurementId, RecordedPrediction>;

/** Outcome of the Anny shadow fit for the scan (numbers only). */
export interface RecordedAnnyInfo {
  status: 'ok' | 'unavailable' | 'error' | 'not-run';
  reason?: string;
  /** RMS outline residual of the fit (cm). */
  rmsResidualCm: number | null;
  /** Fitted stature − entered height (cm). */
  heightErrorCm: number | null;
  iterations: number | null;
  /** Worker time: model load + fit (ms). */
  workerMs: number | null;
  /** Model download + parse inside the worker (ms). */
  modelLoadMs: number | null;
  /** Fit alone (ms). */
  fitMs: number | null;
  viewsUsed: ScanViewId[];
}

/** Tester's observation; `not-recorded` when not answered. */
export type Observation = 'yes' | 'no' | 'not-recorded';

/** Device performance during the scan (measured in the browser) plus the tester's observations. */
export interface ScanPerformance {
  /** Scan start (pressing start) → scan finished (ms), pauses included; null when not observed. */
  scanDurationMs: number | null;
  /** First view captured → last view captured (ms). */
  firstToLastViewMs: number | null;
  /** Pose-model runs per second while scanning: mean and lowest one-second sample. */
  meanDetectionsPerSecond: number | null;
  minDetectionsPerSecond: number | null;
  /** Mean pose-model time per frame while scanning (ms). */
  meanInferenceMs: number | null;
  scanCompletedNormally: Observation;
  cameraResponsive: Observation;
  browserSlowOrFroze: Observation;
}

export interface ValidationScanAttempt {
  /** 1, 2, 3 … per subject. */
  attempt: number;
  /** ISO 8601 time the attempt was recorded. */
  timestamp: string;
  /**
   * False for an incomplete or invalid scan. Its measurements are not recorded (all unavailable) and it is left out
   * of the error metrics and repeatability; it only counts as an unusable attempt.
   */
  usable: boolean;
  unusableReason?: string;
  /** Scan session state when recorded. */
  scanStatus: ScanSessionStatus;
  finishedEarly: boolean;
  clothingType: WornClothingType;
  clothingFit: ClothingFit;
  deviceType: ValidationDeviceType;
  cameraType: ValidationCameraType;
  lighting: LightingCondition;
  /** Browser and platform, detected (e.g. "Chrome 129 · Android"). */
  browser: string;
  /** Device model / browser details typed by the tester (optional). */
  deviceDetails?: string;
  performance: ScanPerformance;
  /** Height entered in the app for this scan (cm), which scales both engines. */
  enteredHeightCm: number | null;
  /** Views captured in the scan. */
  viewsCaptured: ScanViewId[];
  /** Production (ellipse) engine. */
  ellipse: RecordedPredictions;
  ellipseCalibration: string;
  /** Experimental Anny shadow. */
  anny: RecordedPredictions;
  annyInfo: RecordedAnnyInfo;
}

export interface ValidationSubject {
  /** Anonymous code such as "P-001" — never a name. */
  subjectId: string;
  /** Tape-measured height (cm). */
  heightCm: number;
  /** Fixed once the first scan is recorded, so repeated scans share the same ground truth. */
  groundTruth: TapeMeasurement[];
  /** Side used for the thigh and arm measurements. */
  sides: Partial<Record<'thigh' | 'arm-length', MeasuringSide>>;
  attempts: ValidationScanAttempt[];
  /** True only for test fixtures. Synthetic data never represents real-person accuracy. */
  synthetic: boolean;
}
