/**
 * Core domain types for SizerAI.
 *
 * These describe the shape of data that future steps will produce. Nothing in
 * this file creates values: every measurement, prediction or scan must come
 * from real user input or a real detection pipeline, never from placeholders.
 *
 * Internal convention: lengths are stored in centimetres and weight in
 * kilograms. Unit conversion happens only at the UI boundary.
 */

/** Display unit for height. Values are always stored in centimetres. */
export type HeightUnit = 'cm' | 'ft-in';

/** Display unit for weight. Values are always stored in kilograms. */
export type WeightUnit = 'kg' | 'lb';

export type ThemePreference = 'dark' | 'light' | 'system';

/** Size range the user shops in. */
export type Gender = 'men' | 'women' | 'children';

/**
 * Basic information the user enters about themselves. Height and weight are
 * self-reported values, not body measurements.
 */
export interface UserInfo {
  /** Optional display name. Empty string when not provided. */
  name: string;
  gender: Gender | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
}

/** How a set of body measurements was obtained. */
export type MeasurementSource = 'manual' | 'scan';

/** Body measurements in centimetres. Missing values are left undefined. */
export interface BodyMeasurements {
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  shoulderWidthCm?: number;
  inseamCm?: number;
  source: MeasurementSource;
  /** ISO 8601 timestamp of when these measurements were recorded. */
  recordedAt: string;
}

/** Identifier of a clothing category. The category list is defined in a later step. */
export type ClothingCategoryId = string;

/** A size recommendation produced by the (future) prediction service. */
export interface SizePrediction {
  categoryId: ClothingCategoryId;
  size: string;
  /** Model confidence in the range 0–1, as reported by the prediction service. */
  confidence: number;
  createdAt: string;
}

/** A saved set of measurements and preferences the user can reuse. */
export interface FitProfile {
  id: string;
  name: string;
  measurements: BodyMeasurements;
  createdAt: string;
  updatedAt: string;
}

/** Metadata about a completed scan. Raw camera frames are never stored here. */
export interface ScanRecord {
  id: string;
  measurements: BodyMeasurements;
  createdAt: string;
}
