import type { ClothingType, FitPreference } from './domain';
import type { MeasurementId, MeasurementStatus, MeasurementUnit } from './measurement';

/*
 * Size recommendation types (Step 10). A recommendation is a transparent comparison of the user's measurements
 * with a size chart's body-measurement ranges — a rule, not a machine-learning prediction.
 */

/** The letter sizes every chart uses, smallest first. */
export const SIZE_LABELS = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type SizeLabel = (typeof SIZE_LABELS)[number];

/** Body-measurement range (cm) a size is made for: `minCm` inclusive, `maxCm` exclusive. */
export interface SizeRange {
  size: SizeLabel;
  minCm: number;
  maxCm: number;
}

/** One measurement a chart sizes by, with a range for every size (contiguous, smallest first). */
export interface ChartMeasurement {
  id: MeasurementId;
  ranges: SizeRange[];
}

export interface SizeChart {
  garment: ClothingType;
  /** Shown with the result so the user knows which chart was applied. */
  name: string;
  /** Decides the size; without it there is no recommendation. */
  primary: ChartMeasurement;
  /** Checked when available: the garment must also fit here, so a larger size here sizes up. */
  secondary: ChartMeasurement | null;
}

/** A measurement as the engine receives it (a confirmed / reviewed measurement fits this shape). */
export interface SizingMeasurementInput {
  id: MeasurementId;
  value: number | null;
  unit: MeasurementUnit;
  status: MeasurementStatus;
  confidence?: number;
  manuallyEdited?: boolean;
}

export type FitStatus = 'good-fit' | 'slightly-tight' | 'slightly-loose' | 'no-size' | 'insufficient-data';

export type RecommendationStatus =
  /** A size was chosen. */
  | 'recommended'
  /** A required measurement is missing, uncertain beyond use, or invalid. */
  | 'insufficient-data'
  /** The measurements are outside every size on the chart. */
  | 'outside-range'
  /** The garment or audience has no chart. */
  | 'unsupported';

export interface MeasurementUsed {
  id: MeasurementId;
  label: string;
  valueCm: number;
  status: MeasurementStatus;
  manuallyEdited: boolean;
  /** The size this measurement alone points to (null when outside the chart). */
  sizeForMeasurement: SizeLabel | null;
  role: 'primary' | 'secondary';
}

export interface SizeRecommendation {
  garment: ClothingType | null;
  status: RecommendationStatus;
  size: SizeLabel | null;
  fit: FitStatus;
  /** A neighbouring size worth trying when a measurement sits at a size boundary. */
  alternativeSize: SizeLabel | null;
  measurementsUsed: MeasurementUsed[];
  /** True when any measurement used is `uncertain` (an estimate the user should check). */
  basedOnUncertain: boolean;
  /** Plain-language explanation of how the result was reached. */
  reason: string;
  /** Chart that was applied (null when none). */
  chartName: string | null;
  /** The user's fit preference the result was computed for. */
  fitPreference: FitPreference;
  /**
   * Set when the preference moved the size to the neighbouring one (`from` = the size the measurements fall in);
   * null when the preference did not change the size.
   */
  preferenceAdjustment: { from: SizeLabel; to: SizeLabel } | null;
}
