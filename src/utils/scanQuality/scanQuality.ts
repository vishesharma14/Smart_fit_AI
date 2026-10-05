import type { MeasurementReport } from '../../types/measurement';
import type { ScanCapture, ScanViewId } from '../../types/scan';
import type { ScanQuality, ScanQualityFactor, ScanQualityFactorId, ScanQualityLevel } from '../../types/scanQuality';
import { silhouetteScale } from '../measurement/calibration';
import { LM } from '../pose/landmarks';
import { SILHOUETTE_CONFIG } from '../silhouette/silhouetteConfig';
import { CARDINAL_VIEWS, SCAN_VIEWS } from '../scan360/views';

/*
 * Scan quality score (Step 14). Deterministic, local and built only from signals the scan pipeline already keeps
 * for each captured view — no images, no new detection, no model:
 *
 * - Body visibility: the pose model's landmark visibility for shoulders, hips, knees and ankles (the better side of
 *   each pair, so side-on views are not penalised), halved for a view whose outline is cut off at the head or feet.
 * - Pose stability: the outline's frame-to-frame width jitter over the capture hold, scored like the measurement
 *   engine does (1 − jitter / maxWidthJitter).
 * - View coverage: the four main views (80 %) and the four angled views (20 %).
 * - Outline quality: share of views with a usable body outline × its median edge sharpness.
 * - Scale calibration: how reliably the views could be scaled to centimetres with the entered height (the joint
 *   calibration's confidence and each outline's height cross-check against the joints). It cannot tell whether the
 *   entered height itself is right.
 *
 * Lighting is checked live before a view is captured but not recorded per view, so it is not part of the score.
 * Factors without data are left out and the weights renormalised. A scan missing a main view is capped at Fair.
 * The score is informational: it never changes measurements or the size recommendation.
 */

export interface ScanQualityInput {
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  /** The measurement report for the same captures (for the joint calibration), if available. */
  report?: Pick<MeasurementReport, 'calibration'> | null;
  /** Entered height (cm), used for the outline scale check. */
  userHeightCm?: number | null;
}

export const SCAN_QUALITY_WEIGHTS: Record<ScanQualityFactorId, number> = {
  visibility: 0.2,
  stability: 0.15,
  coverage: 0.25,
  outline: 0.25,
  calibration: 0.15,
};

/** Level thresholds (score ≥ value). */
export const SCAN_QUALITY_LEVELS: { level: ScanQualityLevel; min: number }[] = [
  { level: 'excellent', min: 90 },
  { level: 'good', min: 75 },
  { level: 'fair', min: 60 },
  { level: 'poor', min: 0 },
];

/** Highest score for a scan that is missing one of the four main views (top of Fair). */
export const INCOMPLETE_SCAN_MAX_SCORE = 74;
/** A factor below this (0–100) counts as weak and gets a recommendation. */
export const WEAK_FACTOR_BELOW = 75;

export const LEVEL_LABELS: Record<ScanQualityLevel, string> = { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor' };

const KEY_JOINT_PAIRS: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftHip, LM.rightHip],
  [LM.leftKnee, LM.rightKnee],
  [LM.leftAnkle, LM.rightAnkle],
];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (v: number | null) => (v === null ? null : Math.round(clamp01(v) * 100));

export function levelFor(score: number): ScanQualityLevel {
  return (SCAN_QUALITY_LEVELS.find((l) => score >= l.min) ?? SCAN_QUALITY_LEVELS[SCAN_QUALITY_LEVELS.length - 1]).level;
}

function visibilityOf(capture: ScanCapture): number | null {
  const lm = capture.landmarks;
  if (!Array.isArray(lm) || lm.length < 33) return null;
  const pairs = KEY_JOINT_PAIRS.map(([a, b]) => Math.max(clamp01(lm[a]?.visibility ?? 0), clamp01(lm[b]?.visibility ?? 0)));
  const value = mean(pairs) ?? 0;
  const clipped = capture.silhouette ? capture.silhouette.headClipped || capture.silhouette.floorClipped : false;
  return clipped ? value * 0.5 : value;
}

function sharpnessOf(capture: ScanCapture): number | null {
  const rows = capture.silhouette?.rows ?? [];
  return median(rows.flatMap((row) => (row && Number.isFinite(row.sharpness) ? [row.sharpness] : [])));
}

export function calculateScanQuality({ captures, report = null, userHeightCm = null }: ScanQualityInput): ScanQuality {
  const list = SCAN_VIEWS.map((v) => captures[v.id]).filter((c): c is ScanCapture => Boolean(c));
  const cardinalsCaptured = CARDINAL_VIEWS.filter((id) => captures[id]).length;
  const angledCaptured = SCAN_VIEWS.length - CARDINAL_VIEWS.length;
  const angledCount = list.length - cardinalsCaptured;

  // Body visibility.
  const vis = list.map(visibilityOf).filter((v): v is number => v !== null);
  const clippedCount = list.filter((c) => c.silhouette && (c.silhouette.headClipped || c.silhouette.floorClipped)).length;
  const visibility = mean(vis);

  // Pose stability (outline steadiness over each hold).
  const jitters = list.flatMap((c) => {
    const j = c.silhouette?.widthJitter;
    return typeof j === 'number' && Number.isFinite(j) ? [clamp01(1 - j / SILHOUETTE_CONFIG.maxWidthJitter)] : [];
  });
  const stability = mean(jitters);

  // View coverage.
  const coverage = list.length === 0 ? 0 : 0.8 * (cardinalsCaptured / CARDINAL_VIEWS.length) + 0.2 * (angledCount / angledCaptured);

  // Outline quality.
  const withOutline = list.filter((c) => c.silhouette);
  const sharp = withOutline.map(sharpnessOf).filter((v): v is number => v !== null);
  const outline = list.length === 0 ? null : (withOutline.length / list.length) * (mean(sharp.map(clamp01)) ?? 0);

  // Scale calibration.
  const outlineScales = withOutline.map((c) => silhouetteScale(c, userHeightCm)?.confidence ?? 0);
  const calibrationParts = [
    report?.calibration && Number.isFinite(report.calibration.confidence) ? clamp01(report.calibration.confidence) : null,
    mean(outlineScales),
  ].filter((v): v is number => v !== null);
  const calibration = list.length === 0 ? null : mean(calibrationParts);

  const factor = (id: ScanQualityFactorId, label: string, value: number | null, detail: string): ScanQualityFactor => ({
    id,
    label,
    score: pct(value),
    weight: SCAN_QUALITY_WEIGHTS[id],
    detail,
  });
  const factors: ScanQualityFactor[] = [
    factor('visibility', 'Body visibility', visibility, clippedCount > 0 ? `${clippedCount} view${clippedCount > 1 ? 's' : ''} cut off at the head or feet` : 'Joints seen clearly by the pose model'),
    factor('stability', 'Pose stability', stability, 'How steady your outline stayed while each view was captured'),
    factor('coverage', 'View coverage', coverage, `${list.length} of ${SCAN_VIEWS.length} views · ${cardinalsCaptured} of ${CARDINAL_VIEWS.length} main views`),
    factor('outline', 'Outline quality', outline, list.length ? `${withOutline.length} of ${list.length} views with a clear body outline` : 'No views captured'),
    factor('calibration', 'Scale calibration', calibration, 'How reliably your views could be scaled using your height'),
  ];

  const scored = factors.filter((f): f is ScanQualityFactor & { score: number } => f.score !== null);
  const totalWeight = scored.reduce((s, f) => s + f.weight, 0);
  let score = list.length === 0 || totalWeight === 0 ? 0 : Math.round(scored.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight);
  let cappedBecause: string | null = null;
  if (cardinalsCaptured < CARDINAL_VIEWS.length && score > INCOMPLETE_SCAN_MAX_SCORE) {
    score = INCOMPLETE_SCAN_MAX_SCORE;
    cappedBecause = 'Not all four main views (front, both sides, back) were captured.';
  }
  score = Math.min(100, Math.max(0, score));

  const weak = (id: ScanQualityFactorId) => {
    const f = factors.find((x) => x.id === id)!;
    return f.score !== null && f.score < WEAK_FACTOR_BELOW;
  };
  const recommendations: string[] = [];
  if (weak('visibility')) recommendations.push('Keep your full body inside the frame, from head to feet.');
  if (weak('stability')) recommendations.push('Stand still while each view is captured.');
  if (weak('coverage')) {
    recommendations.push(
      cardinalsCaptured < CARDINAL_VIEWS.length
        ? 'Complete the full rotation before continuing.'
        : 'Turn slowly through the in-between angles too, so they can be captured.',
    );
  }
  if (weak('outline')) recommendations.push('Use clearer, even lighting and avoid loose clothing.');
  if (weak('calibration')) {
    recommendations.push(
      typeof userHeightCm === 'number' && Number.isFinite(userHeightCm)
        ? 'Keep your whole body, feet included, clearly in view in every view so the scan can be scaled reliably.'
        : 'Enter your height before scanning so your views can be scaled to centimetres.',
    );
  }

  return { score, level: levelFor(score), factors, recommendations, cappedBecause };
}
