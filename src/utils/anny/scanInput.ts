import type { ScanCapture, ScanViewId } from '../../types/scan';
import { silhouetteScale } from '../measurement/calibration';
import { VIEW_BY_ID } from '../scan360/views';
import { depthAt, projectedWidthAt } from '../silhouette/levels';
import type { AnnyFitInput } from './fit';

/*
 * Turns the 360° scan's captures into the Anny fitter's input: per view, the body's width (metres) at each
 * height fraction, scaled per capture by the entered height. Uses only data the scan already keeps
 * (outline rows, head top / floor, measured angle, landmarks for the arm check) — no images.
 */

/** Height fractions fitted: upper thigh to chest, where the outline is the torso (arms checked out of the way). */
export const ANNY_FIT_FRACTIONS = Array.from({ length: 36 }, (_, i) => 0.4 + (0.35 * i) / 35);
/** Rows a view needs to count. */
export const MIN_ROWS_PER_VIEW = 10;

export type AnnyInputResult =
  | { ok: true; input: AnnyFitInput; viewsUsed: ScanViewId[] }
  | { ok: false; reason: string };

const isSide = (view: ScanViewId) => view === 'left' || view === 'right';

export function buildAnnyFitInput(
  captures: Partial<Record<ScanViewId, ScanCapture>>,
  userHeightCm: number | null | undefined,
  fractions: number[] = ANNY_FIT_FRACTIONS,
): AnnyInputResult {
  if (typeof userHeightCm !== 'number' || !Number.isFinite(userHeightCm)) return { ok: false, reason: 'no entered height to scale the outlines' };
  const views: AnnyFitInput['views'] = [];
  const viewsUsed: ScanViewId[] = [];
  for (const capture of Object.values(captures)) {
    const outline = capture?.silhouette;
    if (!capture || !outline) continue;
    const scale = silhouetteScale(capture, userHeightCm);
    if (!scale) continue;
    // Side-on, the arms hang inside the outline, so the depth is read without the arm check (as the ellipse path does).
    const widths = fractions.map((f) => {
      const level = isSide(capture.phase) ? depthAt(outline, f) : projectedWidthAt(outline, capture.landmarks, f);
      return level ? (level.sizePx * scale.cmPerPx) / 100 : null;
    });
    if (widths.filter((w) => w !== null).length < MIN_ROWS_PER_VIEW) continue;
    views.push({ yawDeg: capture.yawDeg ?? VIEW_BY_ID[capture.phase].yawDeg, widths });
    viewsUsed.push(capture.phase);
  }
  const hasFrontBack = viewsUsed.some((v) => v === 'front' || v === 'back');
  const hasSide = viewsUsed.some(isSide);
  if (!hasFrontBack || !hasSide) {
    return { ok: false, reason: 'needs a usable front or back outline and a usable side outline' };
  }
  return { ok: true, input: { heightM: userHeightCm / 100, fractions, views }, viewsUsed };
}
