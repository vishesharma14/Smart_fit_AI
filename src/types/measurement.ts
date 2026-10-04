import type { ClothingType } from './domain';
import type { ScanViewId } from './scan';

/*
 * Body measurements derived from the scan's captured pose landmarks.
 *
 * A measurement is never guessed: when the captured data can't support it
 * (missing angles, landmarks not clearly visible, inconsistent angles, or a
 * kind of measurement joint landmarks cannot describe) it carries a status
 * saying so and no value — or, for `uncertain`, a value flagged as such.
 */

export type MeasurementId =
  | 'shoulder-width'
  | 'arm-length'
  | 'torso-length'
  | 'chest'
  | 'waist'
  | 'hip'
  | 'thigh'
  | 'leg-length'
  | 'inseam';

/**
 * - `valid`: computed from enough clearly visible landmarks, consistent across angles, with a scale
 * - `uncertain`: computed, but with limited evidence (one angle, low visibility, angles disagree, or no
 *   reliable real-world scale) — not suitable as a firm result
 * - `invalid`: the captures don't contain what this measurement needs; no value
 * - `unsupported`: joint landmarks cannot describe this measurement at all (e.g. girths); no value
 */
export type MeasurementStatus = 'valid' | 'uncertain' | 'invalid' | 'unsupported';

/**
 * `cm` once a calibration gives real-world scale; otherwise `model-units` —
 * the pose model's own (unverified) world-landmark units.
 */
export type MeasurementUnit = 'cm' | 'model-units';

/** How real-world scale was established. */
/**
 * - `user-height`: entered height ÷ stature from the 3D landmarks (joint lengths)
 * - `silhouette-height`: entered height ÷ head-top-to-floor of each capture's body outline, per capture (outline measurements)
 * - `pose-model-metric` / `none`: fallbacks for joint lengths
 */
export type CalibrationMethod = 'user-height' | 'silhouette-height' | 'pose-model-metric' | 'none';

export interface MeasurementSource {
  /** How the value was derived. */
  method: 'landmark-geometry' | 'silhouette-geometry' | 'not-measurable';
  /** Captured angles that contributed a usable sample. */
  angles: ScanViewId[];
  /** Number of individual samples combined (e.g. both arms in the front view). */
  sampleCount: number;
  /** Landmarks the measurement is based on (MediaPipe names). */
  landmarks: string[];
  calibration: CalibrationMethod;
}

export interface Measurement {
  id: MeasurementId;
  /** Human-readable name, e.g. "Shoulder width". */
  name: string;
  /** What exactly is measured, e.g. "Distance between the shoulder joint centres". */
  definition: string;
  /** Rounded to 0.1 in the given unit; null when invalid or unsupported. */
  value: number | null;
  unit: MeasurementUnit;
  /** 0–1: landmark visibility × agreement between angles × angle coverage × calibration. */
  confidence: number;
  source: MeasurementSource;
  status: MeasurementStatus;
  /** Why the measurement is not valid (absent when valid). */
  reason?: string;
}

export interface CalibrationResult {
  method: CalibrationMethod;
  /** Centimetres per world-landmark unit; null when there is no usable scale. */
  cmPerUnit: number | null;
  /** 0–1 trust in the scale. */
  confidence: number;
  detail: string;
}

export interface MeasurementReport {
  region: 'full' | 'upper' | 'lower';
  measurements: Measurement[];
  calibration: CalibrationResult;
  /** Angles whose captures were usable for this region. */
  anglesUsed: ScanViewId[];
  /** Captures that were ignored and why (e.g. wrong region or malformed data). */
  warnings: string[];
}

/**
 * A measurement on the review screen: the engine's `Measurement` (status and
 * confidence unchanged) plus whether the user replaced its value by hand.
 */
export interface ReviewedMeasurement extends Measurement {
  /** The engine's value before any edit (null when the engine gave none). */
  measuredValue: number | null;
  /** True when `value` is the user's own entry rather than the engine's. */
  manuallyEdited: boolean;
}

/** A completed scan's engine output, waiting for review. */
export interface ScanMeasurementResult {
  report: MeasurementReport;
  /** Garment the scan was made for (decides the region); null when none was selected. */
  clothingType: ClothingType | null;
  /** ISO 8601 time the measurements were computed. */
  measuredAt: string;
}

/** The measurements the user reviewed and confirmed (input for size prediction in a later step). */
export interface ConfirmedMeasurements {
  region: MeasurementReport['region'];
  clothingType: ClothingType | null;
  /** Every measurement for the region, including invalid and unsupported ones (value null). */
  measurements: ReviewedMeasurement[];
  calibration: CalibrationResult;
  /** `measuredAt` of the scan result these came from. */
  measuredAt: string;
  /** ISO 8601 time the user confirmed. */
  confirmedAt: string;
}
