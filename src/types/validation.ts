import type { MeasurementId, MeasurementStatus } from './measurement';
import type { ScanViewId } from './scan';

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
  viewsUsed: ScanViewId[];
}

export interface ValidationScanAttempt {
  /** 1, 2, 3 … per subject. */
  attempt: number;
  /** ISO 8601 time the attempt was recorded. */
  timestamp: string;
  clothingType: WornClothingType;
  clothingFit: ClothingFit;
  deviceType: ValidationDeviceType;
  cameraType: ValidationCameraType;
  lighting: LightingCondition;
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
  groundTruth: TapeMeasurement[];
  attempts: ValidationScanAttempt[];
  /** True only for test fixtures. Synthetic data never represents real-person accuracy. */
  synthetic: boolean;
}
