import type { PoseLandmark } from '../../types/pose';
import type { SilhouetteFrame } from '../../types/silhouette';
import { LM } from '../pose/landmarks';
import { median } from './combine';
import { SILHOUETTE_CONFIG } from './silhouetteConfig';

/*
 * Whether one frame's body outline is good enough to be part of a capture
 * (360° scan) and the shared joint cross-check used by the outline scale.
 */

/** Head top above the ears, as a multiple of the ear → shoulder distance (same rule as the framing check). */
const HEAD_TOP_FACTOR = 0.7;

/**
 * The joints only give a rough stature (the head top is extrapolated above the ears), so the outline's stature may
 * differ from it by this much without penalty, and is distrusted beyond the maximum.
 */
export const SILHOUETTE_STATURE_TOLERANCE = 0.1;
export const SILHOUETTE_STATURE_MAX_DISAGREEMENT = 0.25;

/** Rough head-top-to-heel height from the joints, in mask pixels; null when it can't be judged. */
export function jointStaturePx(landmarks: PoseLandmark[], maskHeight: number): number | null {
  const y = (i: number) => (landmarks[i]?.y ?? Number.NaN) * maskHeight;
  const earY = (y(LM.leftEar) + y(LM.rightEar)) / 2;
  const shoulderY = (y(LM.leftShoulder) + y(LM.rightShoulder)) / 2;
  const heelY = (y(LM.leftHeel) + y(LM.rightHeel)) / 2;
  const stature = heelY - (earY + HEAD_TOP_FACTOR * (earY - shoulderY));
  return Number.isFinite(stature) && stature > 0 ? stature : null;
}

/**
 * - `no-outline`: no outline, or its head top / floor wasn't found
 * - `head-cut` / `feet-cut`: the outline runs off the top / bottom of the frame
 * - `height-mismatch`: the outline's height disagrees with the joints (e.g. background merged into it)
 * - `soft-edges`: the outline's edges are too blurred to measure
 */
export type OutlineIssue = 'no-outline' | 'head-cut' | 'feet-cut' | 'height-mismatch' | 'soft-edges';

export interface OutlineQuality {
  issue: OutlineIssue | null;
  /** Head top → floor in mask pixels. */
  staturePx: number | null;
  /** Median edge sharpness over the body's rows (0–1). */
  sharpness: number | null;
  /** Relative difference between the outline's and the joints' stature. */
  disagreement: number | null;
}

export function assessOutlineFrame(
  frame: SilhouetteFrame | null | undefined,
  landmarks: PoseLandmark[] | null | undefined,
  config = SILHOUETTE_CONFIG,
): OutlineQuality {
  const none: OutlineQuality = { issue: 'no-outline', staturePx: null, sharpness: null, disagreement: null };
  if (!frame || !landmarks || frame.headTopY === null || frame.floorY === null || !(frame.floorY > frame.headTopY)) return none;
  const staturePx = frame.floorY - frame.headTopY;
  const rows = frame.rows.filter((row) => row?.center);
  const sharpness = rows.length > 0 ? median(rows.map((row) => row!.sharpness)) : null;
  const joint = jointStaturePx(landmarks, frame.height);
  const disagreement = joint === null ? null : Math.abs(staturePx - joint) / staturePx;
  const result = { staturePx, sharpness, disagreement };
  if (frame.headClipped) return { ...result, issue: 'head-cut' };
  if (frame.floorClipped) return { ...result, issue: 'feet-cut' };
  if (disagreement === null || disagreement > SILHOUETTE_STATURE_MAX_DISAGREEMENT) return { ...result, issue: 'height-mismatch' };
  if (sharpness === null || sharpness < config.minFrameSharpness) return { ...result, issue: 'soft-edges' };
  return { ...result, issue: null };
}
