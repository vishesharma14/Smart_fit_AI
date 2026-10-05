import type { ClothingType } from '../../types/domain';
import type { MeasurementId } from '../../types/measurement';
import { SIZE_LABELS, type ChartMeasurement, type SizeChart } from '../../types/sizing';

/*
 * Size charts (Step 10): generic adult body-measurement ranges in the style of common retail size charts —
 * not any brand's chart. Each size covers a range of BODY measurements (not garment measurements), and the
 * ranges are contiguous so every value inside a chart maps to exactly one size.
 *
 * This module is the single place to change sizing: swap these definitions for real brand charts later without
 * touching the recommendation logic.
 */

/** Builds contiguous S–XXL ranges starting at `startCm`, each `stepCm` wide. */
export function contiguousRanges(id: MeasurementId, startCm: number, stepCm: number): ChartMeasurement {
  return {
    id,
    ranges: SIZE_LABELS.map((size, i) => ({ size, minCm: startCm + i * stepCm, maxCm: startCm + (i + 1) * stepCm })),
  };
}

export const SIZE_CHARTS: Record<ClothingType, SizeChart> = {
  // Tops: sized by chest; waist is checked so the shirt also fits around the middle.
  't-shirt': {
    garment: 't-shirt',
    name: 'Generic adult T-shirt chart (chest)',
    primary: contiguousRanges('chest', 86, 8), // S 86–94 · M 94–102 · L 102–110 · XL 110–118 · XXL 118–126
    secondary: null,
  },
  shirt: {
    garment: 'shirt',
    name: 'Generic adult shirt chart (chest, waist)',
    primary: contiguousRanges('chest', 86, 8), // S 86–94 · M 94–102 · L 102–110 · XL 110–118 · XXL 118–126
    secondary: contiguousRanges('waist', 72, 8), // S 72–80 · M 80–88 · L 88–96 · XL 96–104 · XXL 104–112
  },
  // Tailored: narrower chest steps than casual tops.
  blazer: {
    garment: 'blazer',
    name: 'Generic adult blazer chart (chest, waist)',
    primary: contiguousRanges('chest', 88, 6), // S 88–94 · M 94–100 · L 100–106 · XL 106–112 · XXL 112–118
    secondary: contiguousRanges('waist', 74, 6), // S 74–80 · M 80–86 · L 86–92 · XL 92–98 · XXL 98–104
  },
  // Bottoms: sized by waist; hip is checked so the seat fits.
  jeans: {
    garment: 'jeans',
    name: 'Generic adult jeans chart (waist, hip)',
    primary: contiguousRanges('waist', 72, 8), // S 72–80 · M 80–88 · L 88–96 · XL 96–104 · XXL 104–112
    secondary: contiguousRanges('hip', 88, 8), // S 88–96 · M 96–104 · L 104–112 · XL 112–120 · XXL 120–128
  },
  trousers: {
    garment: 'trousers',
    name: 'Generic adult trousers chart (waist, hip)',
    primary: contiguousRanges('waist', 70, 7), // S 70–77 · M 77–84 · L 84–91 · XL 91–98 · XXL 98–105
    secondary: contiguousRanges('hip', 88, 7), // S 88–95 · M 95–102 · L 102–109 · XL 109–116 · XXL 116–123
  },
};

/** Rules for applying a chart. */
export const SIZING_RULES = {
  /**
   * A body measurement this far (cm) beyond the smallest / largest size still gets that size, marked slightly
   * loose / tight; further out there is no size on the chart.
   */
  edgeToleranceCm: 3,
  /** The outer fraction of a size's range at each end counts as "slightly tight" (top) / "slightly loose" (bottom). */
  edgeBandFraction: 0.2,
  /** Within this distance (cm) of a size boundary the neighbouring size is offered as an alternative. */
  alternativeWithinCm: 1,
  /**
   * Slim Fit takes the smaller size only when the deciding measurement exceeds that size's range by less than this
   * (cm) — a snug but wearable fit. Relaxed Fit takes the larger size when the measurement is in the top band
   * (`edgeBandFraction`) of its size.
   */
  slimReachCm: 1,
  /** Values outside this range (cm) are not plausible body circumferences and are rejected as invalid. */
  plausibleCm: { min: 30, max: 250 },
} as const;
