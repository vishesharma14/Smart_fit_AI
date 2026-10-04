import type { Measurement } from '../../types/measurement';
import type { ScanCapture, ScanViewId } from '../../types/scan';
import { depthAt, findFrontLevels, handAtRow, projectedWidthAt, type LevelFailure, type LevelId } from '../silhouette/levels';
import { SILHOUETTE_CONFIG } from '../silhouette/silhouetteConfig';
import { aggregateSamples, combineConfidence, statusFromConfidence, type AggregateResult, type AngleSample } from './aggregate';
import { silhouetteScale, type SilhouetteScale } from './calibration';
import type { SilhouetteDefinition } from './definitions';

/*
 * Clothing measurements from the body outline.
 *
 * Girths (chest, waist, hip, thigh): the width at the level from the front /
 * back outlines and the depth at the same height from the side outlines, both
 * scaled per capture by the entered height, combined as the perimeter of an
 * ellipse. Real cross-sections aren't ellipses and clothing adds to the
 * outline, so these are estimates. Inseam: crotch (top of the gap between the
 * legs) to the floor, from the front / back outlines.
 *
 * Until they are checked against tape measurements of real people, outline
 * measurements are never `valid`: at best `uncertain`.
 */

export const SILHOUETTE_MEASUREMENT = {
  /** Trust in the elliptical cross-section model (body cross-sections are flatter at the back / rounder at the front). */
  ellipseModelConfidence: 0.8,
  /** The thigh's side depth is read where the legs overlap side-on, which adds error. */
  thighModelConfidence: 0.7,
  /** The crotch point is seen through clothing. */
  inseamModelConfidence: 0.9,
  /** A hand hanging at the level in a side view may widen the outline. */
  sideHandFactor: 0.8,
  /**
   * The person turns on the spot, so the outline's height (px) should be almost the same in every view. With three or
   * more views, a view further than this from their median is left out (e.g. a misplaced head or foot point).
   */
  maxStatureDeviation: 0.08,
  /** Steadiness factor when it couldn't be judged. */
  unknownStability: 0.8,
  /** Below this mean sample quality, the reason mentions soft or unsteady edges. */
  lowQuality: 0.6,
  lowConsistency: 0.5,
  /** Relative error of an angled view's width against the elliptical prediction at which agreement reaches 0. */
  crossSectionTolerance: 0.12,
  /** Cross-section factor without any angled view to check it, and at complete disagreement (1 at full agreement). */
  uncheckedCrossSection: 0.9,
  minCrossSection: 0.75,
} as const;

export const VALIDATION_NOTE =
  'estimated from your body outline and not yet validated against tape measurements, so it is shown as uncertain';

const FAILURE_TEXT: Record<LevelFailure, string> = {
  'no-outline': 'no usable body outline in the front or back view',
  'arms-touching': 'your arms or hands were touching your body at that height in the front and back views',
  'no-crotch': 'the gap between your legs was not visible (stand with your feet hip-width apart)',
  'not-visible': 'that part of your outline could not be measured in the front or back view',
};

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Ellipse perimeter from its semi-axes (Ramanujan's first approximation; exact for a circle). */
export function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

interface ScaledCapture {
  capture: ScanCapture;
  scale: SilhouetteScale;
}

/** 0–1 quality of one outline sample: edge sharpness × steadiness over the hold × trust in the capture's scale. */
function sampleQuality(item: ScaledCapture, sharpness: number): number {
  const jitter = item.capture.silhouette?.widthJitter;
  const steadiness =
    jitter === null || jitter === undefined
      ? SILHOUETTE_MEASUREMENT.unknownStability
      : clamp01(1 - jitter / SILHOUETTE_CONFIG.maxWidthJitter);
  return clamp01(sharpness) * steadiness * item.scale.confidence;
}

const isFrontBack = (phase: ScanViewId) => phase === 'front' || phase === 'back';
const isSide = (phase: ScanViewId) => phase === 'left' || phase === 'right';

/**
 * 45° views (360° scan): the width an elliptical cross-section of width W and depth D would show at the view's
 * measured angle θ, √((W·cos θ)² + (D·sin θ)²), compared with the width actually measured there. They don't change
 * the value; they confirm (or question) the elliptical model behind it.
 */
function crossSectionAgreement(scaled: ScaledCapture[], heightFraction: number, widthCm: number, depthCm: number): number | null {
  const agreements: number[] = [];
  for (const item of scaled) {
    const yaw = item.capture.yawDeg;
    if (isFrontBack(item.capture.phase) || isSide(item.capture.phase) || yaw === undefined) continue;
    const seen = projectedWidthAt(item.capture.silhouette!, item.capture.landmarks, heightFraction);
    if (!seen) continue;
    const theta = (yaw * Math.PI) / 180;
    const predicted = Math.hypot(widthCm * Math.cos(theta), depthCm * Math.sin(theta));
    const relativeError = Math.abs(seen.sizePx * item.scale.cmPerPx - predicted) / predicted;
    agreements.push(clamp01(1 - relativeError / SILHOUETTE_MEASUREMENT.crossSectionTolerance));
  }
  return agreements.length > 0 ? agreements.reduce((sum, a) => sum + a, 0) / agreements.length : null;
}

function base(definition: SilhouetteDefinition) {
  return {
    id: definition.id,
    name: definition.name,
    definition: definition.definition,
    unit: 'cm' as const,
  };
}

function invalid(definition: SilhouetteDefinition, reason: string, angles: ScanViewId[] = []): Measurement {
  return {
    ...base(definition),
    value: null,
    confidence: 0,
    source: { method: 'silhouette-geometry', angles, sampleCount: 0, landmarks: definition.landmarks, calibration: 'silhouette-height' },
    status: 'invalid',
    reason: `Not measured: ${reason}.`,
  };
}

function result(
  definition: SilhouetteDefinition,
  valueCm: number,
  factors: number[],
  aggregates: AggregateResult[],
  causes: string[],
): Measurement {
  const confidence = round3(combineConfidence(factors));
  const computed = statusFromConfidence(confidence, true);
  // Capped until validated against tape measurements: never `valid`.
  const status = computed === 'valid' ? 'uncertain' : computed;
  const angles: ScanViewId[] = [];
  for (const agg of aggregates) for (const angle of agg.angles) if (!angles.includes(angle)) angles.push(angle);
  const meanQuality = aggregates.reduce((sum, agg) => sum + agg.meanWeight, 0) / aggregates.length;
  const allCauses = [...causes];
  if (meanQuality < SILHOUETTE_MEASUREMENT.lowQuality) allCauses.push('the outline edges were soft or unsteady');
  if (aggregates.some((agg) => agg.sampleCount > 1 && agg.consistency < SILHOUETTE_MEASUREMENT.lowConsistency)) {
    allCauses.push('the opposite views disagree');
  }
  if (aggregates.some((agg) => agg.sampleCount === 1)) allCauses.push('one of the views could not be cross-checked');
  const prefix = status === 'invalid' ? 'Too little evidence' : 'Limited evidence';
  // The validation note explains the uncertain cap, so it only accompanies a value that is shown.
  const parts = status === 'invalid' ? (allCauses.length > 0 ? allCauses : ['low overall confidence']) : [VALIDATION_NOTE, ...allCauses];
  return {
    ...base(definition),
    value: status === 'invalid' ? null : round1(valueCm),
    confidence,
    source: {
      method: 'silhouette-geometry',
      angles,
      sampleCount: aggregates.reduce((sum, agg) => sum + agg.sampleCount, 0),
      landmarks: definition.landmarks,
      calibration: 'silhouette-height',
    },
    status,
    reason: `${prefix}: ${parts.join('; ')}.`,
  };
}

/** Leaves out views whose outline height disagrees with the others (see `maxStatureDeviation`). */
function consistentViews(scaled: ScaledCapture[]): { kept: ScaledCapture[]; dropped: ScanViewId[] } {
  if (scaled.length < 3) return { kept: scaled, dropped: [] };
  const stature = (item: ScaledCapture) => item.capture.silhouette!.floorY! - item.capture.silhouette!.headTopY!;
  const sorted = scaled.map(stature).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const typical = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const kept = scaled.filter((item) => Math.abs(stature(item) - typical) / typical <= SILHOUETTE_MEASUREMENT.maxStatureDeviation);
  return { kept, dropped: scaled.filter((item) => !kept.includes(item)).map((item) => item.capture.phase) };
}

const droppedCause = (dropped: ScanViewId[]) =>
  dropped.length > 0 ? [`the ${dropped.join(' and ')} outline’s height did not match the other views, so it was left out`] : [];

function girth(definition: SilhouetteDefinition, level: LevelId, scaled: ScaledCapture[], extraCauses: string[]): Measurement {
  const widths: AngleSample[] = [];
  const fractions: number[] = [];
  const failures: LevelFailure[] = [];
  for (const item of scaled.filter((s) => isFrontBack(s.capture.phase))) {
    const found = findFrontLevels(item.capture.silhouette!, item.capture.landmarks);
    const lv = found.levels[level];
    if (!lv) {
      failures.push(found.failures[level] ?? 'not-visible');
      continue;
    }
    widths.push({ angle: item.capture.phase, value: lv.sizePx * item.scale.cmPerPx, weight: sampleQuality(item, lv.sharpness) });
    fractions.push(lv.heightFraction);
  }
  const widthAgg = aggregateSamples(widths);
  if (!widthAgg || fractions.length === 0) {
    const reason = failures.length > 0 ? FAILURE_TEXT[failures[0]] : 'no usable front or back outline';
    return invalid(definition, reason);
  }

  const heightFraction = fractions.reduce((sum, f) => sum + f, 0) / fractions.length;
  const depths: AngleSample[] = [];
  let handAtSide = false;
  for (const item of scaled.filter((s) => isSide(s.capture.phase))) {
    const outline = item.capture.silhouette!;
    const depth = depthAt(outline, heightFraction);
    if (!depth) continue;
    const hand = handAtRow(item.capture.landmarks, outline, depth.y);
    handAtSide ||= hand;
    depths.push({
      angle: item.capture.phase,
      value: depth.sizePx * item.scale.cmPerPx,
      weight: sampleQuality(item, depth.sharpness) * (hand ? SILHOUETTE_MEASUREMENT.sideHandFactor : 1),
    });
  }
  const depthAgg = aggregateSamples(depths);
  if (!depthAgg) return invalid(definition, 'no usable side-view outline at that height', widthAgg.angles);

  const coverage = (widthAgg.angles.length + depthAgg.angles.length) / 4;
  const model = level === 'thigh' ? SILHOUETTE_MEASUREMENT.thighModelConfidence : SILHOUETTE_MEASUREMENT.ellipseModelConfidence;
  // The legs overlap in angled views, so the thigh's cross-section can't be checked there.
  const agreement = level === 'thigh' ? null : crossSectionAgreement(scaled, heightFraction, widthAgg.value, depthAgg.value);
  const crossSection =
    agreement === null
      ? SILHOUETTE_MEASUREMENT.uncheckedCrossSection
      : SILHOUETTE_MEASUREMENT.minCrossSection + (1 - SILHOUETTE_MEASUREMENT.minCrossSection) * agreement;
  const causes = [...extraCauses];
  if (handAtSide) causes.push('a hand at your side may have widened a side view');
  if (agreement !== null && agreement < SILHOUETTE_MEASUREMENT.lowConsistency) {
    causes.push('the angled views did not match an elliptical cross-section at that height');
  }
  return result(
    definition,
    ellipsePerimeter(widthAgg.value / 2, depthAgg.value / 2),
    [widthAgg.meanWeight, depthAgg.meanWeight, widthAgg.consistency, depthAgg.consistency, 0.5 + 0.5 * coverage, model, crossSection],
    [widthAgg, depthAgg],
    causes,
  );
}

function inseam(definition: SilhouetteDefinition, scaled: ScaledCapture[], extraCauses: string[]): Measurement {
  const samples: AngleSample[] = [];
  for (const item of scaled.filter((s) => isFrontBack(s.capture.phase))) {
    const outline = item.capture.silhouette!;
    if (outline.crotchY === null || outline.floorY === null) continue;
    const below = outline.rows[Math.min(outline.height - 1, Math.ceil(outline.crotchY) + 1)];
    samples.push({
      angle: item.capture.phase,
      value: (outline.floorY - outline.crotchY) * item.scale.cmPerPx,
      weight: sampleQuality(item, below?.sharpness ?? 0),
    });
  }
  const agg = aggregateSamples(samples);
  if (!agg) return invalid(definition, FAILURE_TEXT['no-crotch']);
  return result(
    definition,
    agg.value,
    [agg.meanWeight, agg.consistency, 0.5 + 0.5 * (agg.angles.length / 2), SILHOUETTE_MEASUREMENT.inseamModelConfidence],
    [agg],
    extraCauses,
  );
}

/** Measures one outline-based measurement from the captures (already checked to belong to this scan). */
export function measureSilhouette(
  definition: SilhouetteDefinition,
  captures: ScanCapture[],
  userHeightCm: number | null | undefined,
): Measurement {
  const withOutline = captures.filter((c) => c.silhouette);
  if (withOutline.length === 0) {
    return invalid(
      definition,
      'no usable body outline was captured (you could not be separated clearly from the background, or outline detection was unavailable)',
    );
  }
  if (typeof userHeightCm !== 'number' || !Number.isFinite(userHeightCm)) {
    return invalid(definition, 'your height is needed to scale the body outline');
  }
  const scaled = withOutline.flatMap((capture) => {
    const scale = silhouetteScale(capture, userHeightCm);
    return scale ? [{ capture, scale }] : [];
  });
  if (scaled.length === 0) {
    return invalid(
      definition,
      'the outline could not be scaled (head or feet cut off, an implausible height, or an outline that did not match your pose)',
    );
  }
  const { kept, dropped } = consistentViews(scaled);
  const causes = droppedCause(dropped);
  return definition.feature === 'inseam'
    ? inseam(definition, kept, causes)
    : girth(definition, definition.feature, kept, causes);
}
