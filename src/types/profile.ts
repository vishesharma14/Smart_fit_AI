import type { ClothingType, FitPreference } from './domain';
import type { MeasurementId, MeasurementStatus } from './measurement';
import type { FitStatus, SizeLabel } from './sizing';

/*
 * Saved fit profile and lightweight scan history (Step 11). Numbers and labels only — never images, frames,
 * landmarks or outlines. Kept on this device; the user can delete it at any time.
 */

/** A confirmed measurement as saved with the profile (only measurements that had a value in cm). */
export interface SavedMeasurement {
  id: MeasurementId;
  name: string;
  valueCm: number;
  status: MeasurementStatus;
  /** 0–1 confidence from the measurement engine. */
  confidence: number;
  manuallyEdited: boolean;
}

/** One saved result: which garment, which size, and the measurements it came from. */
export interface ScanRecord {
  /** Stable per scan + garment, so re-saving the same scan updates its entry instead of adding one. */
  id: string;
  garment: ClothingType;
  size: SizeLabel;
  fit: FitStatus;
  /** When the scan's measurements were calculated (ISO 8601). */
  measuredAt: string;
  /** When the user saved this result (ISO 8601). */
  savedAt: string;
}

export interface FitProfile extends ScanRecord {
  /** Fit preference the size was recommended for (profiles saved before Step 13 load as `regular`). */
  fitPreference: FitPreference;
  alternativeSize: SizeLabel | null;
  /** True when the size rests on uncertain (estimated) measurements. */
  basedOnUncertain: boolean;
  chartName: string;
  /** `confirmedAt` of the confirmation this was saved from (changes when measurements are edited and re-confirmed). */
  confirmedAt: string;
  measurements: SavedMeasurement[];
}
