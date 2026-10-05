import type { ClothingType, FitPreference, Gender } from '../../types/domain';
import type { BrandSizeRecommendation, SizingBrandId, SizingMeasurementInput } from '../../types/sizing';
import { getClothingItem } from '../clothingCatalog';
import { brandName, getBrandChart } from './brandCharts';
import { recommendSize } from './recommendSize';

/*
 * Reference brand sizing (Step 15). Generic = the Step 10 engine exactly. A brand applies the same engine (same
 * rules, same fit-preference logic) to that brand's reference chart. A brand without a chart for the garment gets
 * no size — "Reference chart unavailable" — rather than a borrowed or invented one. Deterministic.
 */

export interface RecommendBrandSizeInput {
  brand: SizingBrandId;
  garment: ClothingType | null;
  measurements: readonly SizingMeasurementInput[];
  fitPreference?: FitPreference;
  audience?: Gender | null;
}

export const REFERENCE_CHART_UNAVAILABLE = 'Reference chart unavailable';

export function recommendBrandSize({ brand, garment, measurements, fitPreference = 'regular', audience = null }: RecommendBrandSizeInput): BrandSizeRecommendation {
  const name = brandName(brand);
  if (brand === 'generic') {
    return { ...recommendSize({ garment, measurements, audience, fitPreference }), brand, brandName: name, chartAvailable: true };
  }
  const brandChart = getBrandChart(brand);
  const chart = garment ? brandChart?.charts[garment] : undefined;
  if (!brandChart || !garment || !chart) {
    return {
      garment,
      status: 'unsupported',
      size: null,
      fit: 'insufficient-data',
      alternativeSize: null,
      measurementsUsed: [],
      basedOnUncertain: false,
      reason: garment
        ? `${REFERENCE_CHART_UNAVAILABLE}: there is no ${name} reference chart for ${getClothingItem(garment).label}, so no ${name} size is shown. Choose Generic or another brand.`
        : `${REFERENCE_CHART_UNAVAILABLE}: no garment is selected.`,
      chartName: null,
      fitPreference,
      preferenceAdjustment: null,
      brand,
      brandName: name,
      chartAvailable: false,
    };
  }
  return {
    ...recommendSize({ garment, measurements, audience, fitPreference, charts: { [garment]: chart } }),
    brand,
    brandName: name,
    chartAvailable: true,
  };
}
