import type { ClothingType } from '../../types/domain';
import type { ScanMeasurementResult } from '../../types/measurement';
import type { ScanCapture, ScanPhaseId } from '../../types/scan';
import { scanRegionFor } from '../pose/scanRegions';
import { measureScan } from './measureScan';

export interface CompletedScanInput {
  captures: Partial<Record<ScanPhaseId, ScanCapture>>;
  /** The garment selected for the scan; decides the measured region, exactly as it decided the scanned one. */
  clothingType: ClothingType | null | undefined;
  /** Height the user entered, if any (enables the height calibration). */
  userHeightCm: number | null | undefined;
  now?: Date;
}

/** Runs the Step 7 measurement engine on a completed scan's captures. No other formulas are applied. */
export function measureCompletedScan({ captures, clothingType, userHeightCm, now = new Date() }: CompletedScanInput): ScanMeasurementResult {
  const report = measureScan({ captures, region: scanRegionFor(clothingType).id, userHeightCm });
  return { report, clothingType: clothingType ?? null, measuredAt: now.toISOString() };
}
