import type { ClothingType } from '../../types/domain';
import type { BrandSizeChart, SizeChart, SizingBrandId } from '../../types/sizing';
import { contiguousRanges } from './sizeCharts';

/*
 * Reference brand size charts (Step 15). Small hand-entered datasets in the style of each brand's published adult
 * letter-size charts (S–XXL, body measurements in cm). They are NOT official brand data, are not fetched from the
 * brands and are not updated automatically: real brand sizing differs between product lines, fits and regions.
 *
 * Only garments with a meaningful reference chart are listed; any other brand + garment has no brand result
 * ("Reference chart unavailable") — the generic chart is never substituted silently.
 */

/** Shown with every brand result. */
export const REFERENCE_CHART_DISCLAIMER = 'Reference size chart — actual sizing may vary by product and region.';

/** Shown next to a brand size on the Results page. */
export const REFERENCE_SIZING_NOTE = 'Reference sizing. Actual fit can vary by product, region, and cut.';

const SOURCE_NOTE = `${REFERENCE_CHART_DISCLAIMER} Hand-entered reference values, not official brand data.`;

function chart(brandName: string, garment: ClothingType, label: string, primary: SizeChart['primary'], secondary: SizeChart['secondary'] = null): SizeChart {
  const by = secondary ? `${primary.id}, ${secondary.id}` : primary.id;
  return { garment, name: `${brandName} reference ${label} chart (${by})`, primary, secondary };
}

export const BRAND_SIZE_CHARTS: readonly BrandSizeChart[] = [
  {
    brandId: 'nike',
    brandName: 'Nike',
    sourceNote: SOURCE_NOTE,
    charts: {
      // Athletic tops: chest. S 88–96 · M 96–104 · L 104–112 · XL 112–120 · XXL 120–128
      't-shirt': chart('Nike', 't-shirt', 'T-shirt', contiguousRanges('chest', 88, 8)),
      // Training / track pants: waist, hip. Waist S 73–81 · M 81–89 · L 89–97 · XL 97–105 · XXL 105–113
      trousers: chart('Nike', 'trousers', 'trousers', contiguousRanges('waist', 73, 8), contiguousRanges('hip', 88, 8)),
    },
  },
  {
    brandId: 'levis',
    brandName: "Levi's",
    sourceNote: SOURCE_NOTE,
    charts: {
      // Tops: chest (shirts also waist). Chest S 89–97 · M 97–105 · L 105–113 · XL 113–121 · XXL 121–129
      't-shirt': chart("Levi's", 't-shirt', 'T-shirt', contiguousRanges('chest', 89, 8)),
      shirt: chart("Levi's", 'shirt', 'shirt', contiguousRanges('chest', 89, 8), contiguousRanges('waist', 74, 8)),
      // Bottoms in letter sizes: waist, hip. Waist S 74–81 · M 81–88 · L 88–95 · XL 95–102 · XXL 102–109
      jeans: chart("Levi's", 'jeans', 'jeans', contiguousRanges('waist', 74, 7), contiguousRanges('hip', 90, 7)),
      trousers: chart("Levi's", 'trousers', 'trousers', contiguousRanges('waist', 74, 7), contiguousRanges('hip', 90, 7)),
    },
  },
  {
    brandId: 'hm',
    brandName: 'H&M',
    sourceNote: SOURCE_NOTE,
    charts: {
      // Chest S 84–92 · M 92–100 · L 100–108 · XL 108–116 · XXL 116–124
      't-shirt': chart('H&M', 't-shirt', 'T-shirt', contiguousRanges('chest', 84, 8)),
      shirt: chart('H&M', 'shirt', 'shirt', contiguousRanges('chest', 84, 8), contiguousRanges('waist', 70, 8)),
      // Tailored: chest S 90–96 · M 96–102 · L 102–108 · XL 108–114 · XXL 114–120
      blazer: chart('H&M', 'blazer', 'blazer', contiguousRanges('chest', 90, 6), contiguousRanges('waist', 76, 6)),
      // Waist S 70–78 · M 78–86 · L 86–94 · XL 94–102 · XXL 102–110
      jeans: chart('H&M', 'jeans', 'jeans', contiguousRanges('waist', 70, 8), contiguousRanges('hip', 86, 8)),
      trousers: chart('H&M', 'trousers', 'trousers', contiguousRanges('waist', 70, 8), contiguousRanges('hip', 86, 8)),
    },
  },
];

/** Options for the brand choice; Generic (the Step 10 charts) first and default. */
export const SIZING_BRAND_OPTIONS: readonly { id: SizingBrandId; name: string }[] = [
  { id: 'generic', name: 'Generic' },
  ...BRAND_SIZE_CHARTS.map((b) => ({ id: b.brandId, name: b.brandName })),
];

export const DEFAULT_SIZING_BRAND: SizingBrandId = 'generic';

export function getBrandChart(brand: SizingBrandId): BrandSizeChart | null {
  return BRAND_SIZE_CHARTS.find((b) => b.brandId === brand) ?? null;
}

export function brandName(brand: SizingBrandId): string {
  return SIZING_BRAND_OPTIONS.find((o) => o.id === brand)?.name ?? brand;
}

export function isSizingBrandId(value: unknown): value is SizingBrandId {
  return SIZING_BRAND_OPTIONS.some((o) => o.id === value);
}
