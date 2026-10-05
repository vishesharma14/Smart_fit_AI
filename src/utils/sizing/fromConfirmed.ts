import type { ClothingSelection, Gender } from '../../types/domain';
import type { ConfirmedMeasurements } from '../../types/measurement';
import type { SizeRecommendation } from '../../types/sizing';
import { recommendSize } from './recommendSize';

/**
 * Size recommendation for the user's confirmed measurements (Step 10). The garment is the one the scan was made
 * for, else the current clothing selection. Without confirmed measurements there is nothing to compare.
 */
export function recommendForConfirmed(
  confirmed: ConfirmedMeasurements | null,
  clothingSelection: ClothingSelection | null,
  audience: Gender | null = null,
): SizeRecommendation {
  const garment = confirmed?.clothingType ?? clothingSelection?.type ?? null;
  if (!confirmed) {
    return {
      garment,
      status: 'insufficient-data',
      size: null,
      fit: 'insufficient-data',
      alternativeSize: null,
      measurementsUsed: [],
      basedOnUncertain: false,
      reason: 'Confirm your measurements first; the size is chosen from them.',
      chartName: null,
    };
  }
  return recommendSize({ garment, measurements: confirmed.measurements, audience });
}
