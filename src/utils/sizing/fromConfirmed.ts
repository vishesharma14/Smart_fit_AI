import type { ClothingSelection, ClothingType, FitPreference, Gender } from '../../types/domain';
import type { ConfirmedMeasurements } from '../../types/measurement';
import type { BrandSizeRecommendation, SizeRecommendation, SizingBrandId } from '../../types/sizing';
import { DEFAULT_FIT_PREFERENCE, fitsFor } from '../clothingCatalog';
import { brandName } from './brandCharts';
import { recommendBrandSize } from './recommendBrandSize';
import { recommendSize } from './recommendSize';

/**
 * The user's fit preference for a garment: the one chosen on the Clothing Selection step when it applies to that
 * garment, else Regular.
 */
export function fitPreferenceFor(garment: ClothingType | null, clothingSelection: ClothingSelection | null): FitPreference {
  const chosen = clothingSelection?.fit ?? null;
  return garment && chosen && clothingSelection?.type === garment && fitsFor(garment).includes(chosen) ? chosen : DEFAULT_FIT_PREFERENCE;
}

/**
 * Size recommendation for the user's confirmed measurements (Step 10). The garment is the one the scan was made
 * for, else the current clothing selection; the fit preference comes from the clothing selection (Step 13).
 * Without confirmed measurements there is nothing to compare.
 */
export function recommendForConfirmed(
  confirmed: ConfirmedMeasurements | null,
  clothingSelection: ClothingSelection | null,
  audience: Gender | null = null,
): SizeRecommendation {
  const garment = confirmed?.clothingType ?? clothingSelection?.type ?? null;
  const fitPreference = fitPreferenceFor(garment, clothingSelection);
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
      fitPreference,
      preferenceAdjustment: null,
    };
  }
  return recommendSize({ garment, measurements: confirmed.measurements, audience, fitPreference });
}

/**
 * Size for the confirmed measurements on the chosen sizing chart (Step 15): Generic is exactly
 * `recommendForConfirmed`; a brand uses its reference chart with the same rules and the same fit preference.
 */
export function recommendBrandForConfirmed(
  confirmed: ConfirmedMeasurements | null,
  clothingSelection: ClothingSelection | null,
  audience: Gender | null,
  brand: SizingBrandId,
): BrandSizeRecommendation {
  if (brand === 'generic' || !confirmed) {
    return { ...recommendForConfirmed(confirmed, clothingSelection, audience), brand, brandName: brandName(brand), chartAvailable: true };
  }
  const garment = confirmed.clothingType ?? clothingSelection?.type ?? null;
  return recommendBrandSize({ brand, garment, measurements: confirmed.measurements, fitPreference: fitPreferenceFor(garment, clothingSelection), audience });
}
