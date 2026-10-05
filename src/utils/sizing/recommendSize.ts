import type { ClothingType, FitPreference, Gender } from '../../types/domain';
import type { MeasurementId, MeasurementStatus } from '../../types/measurement';
import {
  SIZE_LABELS,
  type ChartMeasurement,
  type FitStatus,
  type MeasurementUsed,
  type SizeChart,
  type SizeLabel,
  type SizeRecommendation,
  type SizingMeasurementInput,
} from '../../types/sizing';
import { getClothingItem } from '../clothingCatalog';
import { MEASUREMENT_DEFINITIONS } from '../measurement/definitions';
import { SIZE_CHARTS, SIZING_RULES } from './sizeCharts';

/*
 * Size recommendation (Step 10): compares the user's measurements with the selected garment's size chart.
 *
 * - The chart's primary measurement decides the size; without a usable value there is no recommendation
 *   ("insufficient data") — nothing is estimated, defaulted or substituted.
 * - The secondary measurement is checked when available: if it needs a larger size, the larger size is chosen
 *   so the garment fits in both places.
 * - Fit: where the deciding measurement sits within its size's range (near the top = slightly tight, near the
 *   bottom = slightly loose, else good fit). A neighbouring size is offered when a value sits at a boundary.
 * - `uncertain` measurements are used but flagged, so the result says it rests on an estimate.
 * - Fit preference (Regular = the baseline above) only chooses between neighbouring sizes at a boundary, and only
 *   where the measurements allow it: Slim takes the smaller size when the deciding measurement is within
 *   `SIZING_RULES.slimReachCm` above that size's range (and the other measurement fits it); Relaxed takes the larger
 *   size when the deciding measurement is in the top band of its size. Missing data and "no size" are unaffected.
 *
 * Deterministic and rule-based: the same measurements always give the same result. No machine learning.
 */

export interface RecommendSizeInput {
  garment: ClothingType | null;
  measurements: readonly SizingMeasurementInput[];
  /** Size range the user shops in; only adult charts exist, so `children` is unsupported. */
  audience?: Gender | null;
  /** How the user likes clothes to fit (default Regular = no adjustment). */
  fitPreference?: FitPreference;
  /** Charts to apply (default: the generic charts). A garment without a chart here is unsupported. */
  charts?: Partial<Record<ClothingType, SizeChart>>;
}

type Resolved =
  | { kind: 'usable'; valueCm: number; status: MeasurementStatus; manuallyEdited: boolean }
  | { kind: 'missing'; reason: string }
  | { kind: 'invalid'; reason: string };

interface Location {
  /** Index into SIZE_LABELS, or null when outside the chart beyond the tolerance. */
  index: number | null;
  /** Below the smallest / above the largest size (within or beyond the tolerance). */
  side: 'below' | 'above' | 'inside';
  /** Position inside the chosen size's range. */
  band: 'low' | 'mid' | 'high';
  /** Distance (cm) to the size's lower and upper boundary. */
  toLower: number;
  toUpper: number;
}

export function measurementLabel(id: MeasurementId): string {
  return MEASUREMENT_DEFINITIONS.find((d) => d.id === id)?.name ?? id;
}

const fmt = (cm: number) => `${Math.round(cm * 10) / 10} cm`;

export function resolveMeasurement(measurements: readonly SizingMeasurementInput[], id: MeasurementId): Resolved {
  const m = measurements.find((x) => x.id === id);
  const label = measurementLabel(id);
  if (!m) return { kind: 'missing', reason: `${label} was not measured for this garment.` };
  if (m.status === 'invalid' || m.status === 'unsupported' || m.value === null)
    return { kind: 'missing', reason: `${label} is unavailable from the scan.` };
  if (m.unit !== 'cm') return { kind: 'invalid', reason: `${label} has no real-world scale (not in centimetres).` };
  const { min, max } = SIZING_RULES.plausibleCm;
  if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value < min || m.value > max)
    return { kind: 'invalid', reason: `${label} (${String(m.value)}) is not a plausible body measurement.` };
  return { kind: 'usable', valueCm: m.value, status: m.status, manuallyEdited: m.manuallyEdited ?? false };
}

export function locate(chartMeasurement: ChartMeasurement, valueCm: number): Location {
  const { ranges } = chartMeasurement;
  const tol = SIZING_RULES.edgeToleranceCm;
  const bandOf = (minCm: number, maxCm: number): Location['band'] => {
    const band = (maxCm - minCm) * SIZING_RULES.edgeBandFraction;
    if (valueCm >= maxCm - band) return 'high';
    if (valueCm < minCm + band) return 'low';
    return 'mid';
  };
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  if (valueCm < first.minCm) {
    const inside = first.minCm - valueCm <= tol;
    return { index: inside ? 0 : null, side: 'below', band: 'low', toLower: valueCm - first.minCm, toUpper: first.maxCm - valueCm };
  }
  if (valueCm >= last.maxCm) {
    const inside = valueCm - last.maxCm <= tol;
    return {
      index: inside ? ranges.length - 1 : null,
      side: 'above',
      band: 'high',
      toLower: valueCm - last.minCm,
      toUpper: last.maxCm - valueCm,
    };
  }
  const index = ranges.findIndex((r) => valueCm >= r.minCm && valueCm < r.maxCm);
  const r = ranges[index];
  return { index, side: 'inside', band: bandOf(r.minCm, r.maxCm), toLower: valueCm - r.minCm, toUpper: r.maxCm - valueCm };
}

const sizeAt = (index: number | null): SizeLabel | null => (index === null ? null : SIZE_LABELS[index]);

function result(partial: Partial<SizeRecommendation> & Pick<SizeRecommendation, 'status' | 'reason'>): SizeRecommendation {
  return {
    garment: null,
    size: null,
    fit: partial.status === 'recommended' ? 'good-fit' : partial.status === 'outside-range' ? 'no-size' : 'insufficient-data',
    alternativeSize: null,
    measurementsUsed: [],
    basedOnUncertain: false,
    chartName: null,
    fitPreference: 'regular',
    preferenceAdjustment: null,
    ...partial,
  };
}

const PREFERENCE_LABELS: Record<FitPreference, string> = { slim: 'Slim Fit', regular: 'Regular Fit', relaxed: 'Relaxed Fit' };

export function recommendSize({
  garment,
  measurements,
  audience = null,
  fitPreference = 'regular',
  charts = SIZE_CHARTS,
}: RecommendSizeInput): SizeRecommendation {
  const chart = garment ? charts[garment] : undefined;
  if (!garment || !chart) {
    return result({ status: 'unsupported', garment, fitPreference, reason: 'No garment is selected, so there is no size chart to compare with.' });
  }
  const garmentLabel = getClothingItem(garment).label;
  if (audience === 'children') {
    return result({
      status: 'unsupported',
      garment,
      fitPreference,
      reason: `Only adult size charts are available, so no ${garmentLabel} size can be recommended in children's sizes.`,
    });
  }
  const base = { garment, chartName: chart.name, fitPreference };
  const primaryLabel = measurementLabel(chart.primary.id);

  const primary = resolveMeasurement(measurements, chart.primary.id);
  if (primary.kind !== 'usable') {
    return result({
      ...base,
      status: 'insufficient-data',
      reason: `${garmentLabel} sizes are chosen by ${primaryLabel.toLowerCase()}. ${primary.reason} Insufficient measurements for a recommendation.`,
    });
  }

  const notes: string[] = [];
  const primaryLoc = locate(chart.primary, primary.valueCm);
  const used: MeasurementUsed[] = [
    {
      id: chart.primary.id,
      label: primaryLabel,
      valueCm: primary.valueCm,
      status: primary.status,
      manuallyEdited: primary.manuallyEdited,
      sizeForMeasurement: sizeAt(primaryLoc.index),
      role: 'primary',
    },
  ];

  let secondaryLoc: Location | null = null;
  if (chart.secondary) {
    const secondaryLabel = measurementLabel(chart.secondary.id);
    const secondary = resolveMeasurement(measurements, chart.secondary.id);
    if (secondary.kind === 'usable') {
      secondaryLoc = locate(chart.secondary, secondary.valueCm);
      used.push({
        id: chart.secondary.id,
        label: secondaryLabel,
        valueCm: secondary.valueCm,
        status: secondary.status,
        manuallyEdited: secondary.manuallyEdited,
        sizeForMeasurement: sizeAt(secondaryLoc.index),
        role: 'secondary',
      });
    } else {
      notes.push(`${secondary.reason} The size is based on ${primaryLabel.toLowerCase()} only.`);
    }
  }
  const basedOnUncertain = used.some((u) => u.status === 'uncertain');
  const common = { ...base, measurementsUsed: used, basedOnUncertain };

  if (primaryLoc.index === null) {
    const where = primaryLoc.side === 'below' ? 'smaller than the smallest' : 'larger than the largest';
    return result({
      ...common,
      status: 'outside-range',
      reason: `Your ${primaryLabel.toLowerCase()} (${fmt(primary.valueCm)}) is ${where} size on the ${chart.name}. No size on this chart fits.`,
    });
  }
  if (secondaryLoc && secondaryLoc.index === null && secondaryLoc.side === 'above') {
    const secondaryUsed = used[1];
    return result({
      ...common,
      status: 'outside-range',
      reason: `Your ${secondaryUsed.label.toLowerCase()} (${fmt(secondaryUsed.valueCm)}) is larger than the largest size on the ${chart.name}. No size on this chart fits both measurements.`,
    });
  }

  // The garment has to fit everywhere it is sized: take the larger of the two sizes.
  const secondaryIndex = secondaryLoc?.index ?? null;
  const secondaryDecides = secondaryIndex !== null && secondaryIndex > primaryLoc.index;
  const index = secondaryDecides ? secondaryIndex : primaryLoc.index;
  const decidingLoc = secondaryDecides ? secondaryLoc! : primaryLoc;
  const deciding = secondaryDecides ? used[1] : used[0];
  const other = secondaryDecides ? used[0] : used[1];
  const otherIndex = secondaryDecides ? primaryLoc.index : secondaryIndex;
  const baseSize = SIZE_LABELS[index];

  let fit: FitStatus = decidingLoc.band === 'high' ? 'slightly-tight' : decidingLoc.band === 'low' ? 'slightly-loose' : 'good-fit';
  if (other && (otherIndex === null || otherIndex < index) && fit === 'good-fit') fit = 'slightly-loose';

  // A neighbouring size when the deciding value sits right at a boundary.
  let alternativeSize: SizeLabel | null = null;
  const near = SIZING_RULES.alternativeWithinCm;
  const smallerFitsOther = otherIndex === null || otherIndex <= index - 1;
  if (decidingLoc.side === 'inside' && decidingLoc.toUpper <= near && index < SIZE_LABELS.length - 1) {
    alternativeSize = SIZE_LABELS[index + 1];
  } else if (decidingLoc.side === 'inside' && decidingLoc.toLower < near && index > 0 && smallerFitsOther) {
    alternativeSize = SIZE_LABELS[index - 1];
  }

  // Fit preference: only between neighbouring sizes, only where the measurements still fit the other size.
  let finalIndex = index;
  if (decidingLoc.side === 'inside') {
    if (fitPreference === 'slim' && index > 0 && decidingLoc.toLower < SIZING_RULES.slimReachCm && smallerFitsOther) {
      finalIndex = index - 1;
    } else if (fitPreference === 'relaxed' && index < SIZE_LABELS.length - 1 && decidingLoc.band === 'high') {
      finalIndex = index + 1;
    }
  }
  const size = SIZE_LABELS[finalIndex];
  const preferenceAdjustment = finalIndex !== index ? { from: baseSize, to: size } : null;
  if (preferenceAdjustment) {
    // The smaller size sits just below the measurement (snug); the larger one just above it (roomy).
    fit = finalIndex < index ? 'slightly-tight' : 'slightly-loose';
    alternativeSize = baseSize;
  }

  const sentences = [
    `Your ${deciding.label.toLowerCase()} of ${fmt(deciding.valueCm)} falls in size ${baseSize} on the ${chart.name}.`,
  ];
  if (secondaryDecides) {
    sentences.push(`Your ${used[0].label.toLowerCase()} alone points to ${used[0].sizeForMeasurement}, but ${deciding.label.toLowerCase()} needs ${baseSize}, so ${baseSize} is recommended to fit both.`);
  } else if (other && other.sizeForMeasurement !== baseSize) {
    sentences.push(
      other.sizeForMeasurement
        ? `Your ${other.label.toLowerCase()} points to ${other.sizeForMeasurement}, so the garment may be roomier there.`
        : `Your ${other.label.toLowerCase()} is below the smallest size, so the garment may be roomier there.`,
    );
  }
  const preferenceLabel = PREFERENCE_LABELS[fitPreference];
  if (preferenceAdjustment) {
    sentences.push(
      finalIndex < index
        ? `It is just above the ${size} range, so with your ${preferenceLabel} preference ${size} is recommended for a closer fit (${baseSize} is the regular choice).`
        : `It is near the top of the ${baseSize} range, so with your ${preferenceLabel} preference ${size} is recommended for a roomier fit (${baseSize} is the regular choice).`,
    );
  } else {
    if (decidingLoc.side === 'above') sentences.push(`It is above the ${size} range, so ${size} may feel tight.`);
    else if (decidingLoc.side === 'below') sentences.push(`It is below the ${size} range, so ${size} may feel loose.`);
    else if (fit === 'slightly-tight') sentences.push(`It is near the top of the ${size} range, so the fit may be slightly tight.`);
    else if (fit === 'slightly-loose' && decidingLoc.band === 'low') sentences.push(`It is near the bottom of the ${size} range, so the fit may be slightly loose.`);
    if (alternativeSize) sentences.push(`You are at the boundary with ${alternativeSize}; consider trying both.`);
    if (fitPreference !== 'regular') {
      sentences.push(
        fitPreference === 'slim'
          ? `Your ${preferenceLabel} preference keeps ${size}: your measurements are not close enough to the smaller size for it to fit.`
          : `Your ${preferenceLabel} preference keeps ${size}: your measurements sit comfortably within it${finalIndex === SIZE_LABELS.length - 1 ? '' : ', so a larger size would be too loose'}.`,
      );
    }
  }
  sentences.push(...notes);
  if (basedOnUncertain) {
    const names = used.filter((u) => u.status === 'uncertain').map((u) => u.label.toLowerCase());
    sentences.push(`Based on an uncertain estimate (${names.join(', ')}); check with a tape measure before buying.`);
  }

  return result({ ...common, status: 'recommended', size, fit, alternativeSize, preferenceAdjustment, reason: sentences.join(' ') });
}

export const FIT_LABELS: Record<FitStatus, string> = {
  'good-fit': 'Good Fit',
  'slightly-tight': 'Slightly Tight',
  'slightly-loose': 'Slightly Loose',
  'no-size': 'No Suitable Size',
  'insufficient-data': 'Insufficient Data',
};
