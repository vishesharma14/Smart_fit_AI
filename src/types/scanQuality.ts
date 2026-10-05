/*
 * Scan quality (Step 14): an informational summary of how good the captured scan data is, computed on the device
 * from signals the scan pipeline already records. It never changes measurements or the size recommendation.
 */

export type ScanQualityFactorId = 'visibility' | 'stability' | 'coverage' | 'outline' | 'calibration';

export type ScanQualityLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface ScanQualityFactor {
  id: ScanQualityFactorId;
  label: string;
  /** 0–100, or null when the scan has no data for this factor (then it is left out of the score). */
  score: number | null;
  /** Relative weight in the overall score. */
  weight: number;
  /** One-line explanation of what was measured. */
  detail: string;
}

export interface ScanQuality {
  /** 0–100, rounded. */
  score: number;
  level: ScanQualityLevel;
  factors: ScanQualityFactor[];
  /** Short actions for the weak factors (empty when nothing is weak). */
  recommendations: string[];
  /** Why the score was capped, when it was (e.g. a main view is missing). */
  cappedBecause: string | null;
}
