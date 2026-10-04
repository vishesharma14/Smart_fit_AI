import type { ScanPhaseId } from './scan';

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
export type CalibrationMethod = 'user-height' | 'pose-model-metric' | 'none';

export interface MeasurementSource {
  /** How the value was derived. */
  method: 'landmark-geometry' | 'not-measurable';
  /** Captured angles that contributed a usable sample. */
  angles: ScanPhaseId[];
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
  anglesUsed: ScanPhaseId[];
  /** Captures that were ignored and why (e.g. wrong region or malformed data). */
  warnings: string[];
}
