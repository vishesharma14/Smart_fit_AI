import type { PoseLandmark } from '../../types/pose';
import type { SilhouetteFrame, SilhouetteRow, SilhouetteRun } from '../../types/silhouette';
import { LM } from '../pose/landmarks';
import { SILHOUETTE_CONFIG } from './silhouetteConfig';

/*
 * Turns one frame's segmentation mask into outline numbers, then the mask is
 * dropped by the caller. Pure and synchronous, so it runs inside the pose
 * model's callback, where the mask is valid.
 *
 * The outline is followed from the detected joints: each row's run is the
 * stretch of person pixels that contains the body's centre line (or a leg's
 * line), so background blobs and other objects are never measured.
 */

/** A read-only view of a mask: `data[y * width + x]` is the 0–1 person confidence. */
export interface MaskView {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

interface Pt {
  x: number;
  y: number;
}

/** A polyline through points ordered top → bottom; x at a row, clamped to the ends. */
function lineX(points: Pt[], y: number): number {
  if (y <= points[0].y) return points[0].x;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (y <= b.y) return b.y === a.y ? b.x : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return points[points.length - 1].x;
}

const finitePt = (p: Pt): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export function extractSilhouetteFrame(
  mask: MaskView,
  landmarks: PoseLandmark[],
  config = SILHOUETTE_CONFIG,
): SilhouetteFrame | null {
  const { width: W, height: H, data } = mask;
  if (!(W > 0 && H > 0) || data.length < W * H || landmarks.length < 33) return null;
  const t = config.threshold;
  const px = (i: number): Pt => ({ x: landmarks[i].x * W, y: landmarks[i].y * H });
  const mid = (a: number, b: number): Pt => {
    const p = px(a);
    const q = px(b);
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };
  const ear = mid(LM.leftEar, LM.rightEar);
  const shoulder = mid(LM.leftShoulder, LM.rightShoulder);
  const hip = mid(LM.leftHip, LM.rightHip);
  const knee = mid(LM.leftKnee, LM.rightKnee);
  const ankle = mid(LM.leftAnkle, LM.rightAnkle);
  const centre = [ear, shoulder, hip, knee, ankle];
  const leftLegLine = [px(LM.leftHip), px(LM.leftKnee), px(LM.leftAnkle)];
  const rightLegLine = [px(LM.rightHip), px(LM.rightKnee), px(LM.rightAnkle)];
  if (![...centre, ...leftLegLine, ...rightLegLine].every(finitePt)) return null;
  if (!(ear.y < shoulder.y && shoulder.y < hip.y && hip.y < ankle.y)) return null;

  const value = (x: number, y: number): number => {
    const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
    const v = data[yi * W + xi];
    return Number.isFinite(v) ? v : 0;
  };
  /** Sub-pixel position where the mask crosses the threshold between an inside and an outside pixel. */
  const crossing = (inside: number, outside: number, vIn: number, vOut: number): number =>
    vIn === vOut ? (inside + outside) / 2 : outside + ((t - vOut) / (vIn - vOut)) * (inside - outside);

  /** The run of person pixels on row y containing seedX, or null when the seed is background. */
  const runAt = (y: number, seedX: number): { run: SilhouetteRun; sharpness: number } | null => {
    const row = y * W;
    let x = Math.round(seedX);
    if (x < 0 || x >= W || !(data[row + x] >= t)) return null;
    let l = x;
    while (l > 0 && data[row + l - 1] >= t) l -= 1;
    let r = x;
    while (r < W - 1 && data[row + r + 1] >= t) r += 1;
    const left = l === 0 ? 0 : crossing(l, l - 1, data[row + l], data[row + l - 1]);
    const right = r === W - 1 ? W - 1 : crossing(r, r + 1, data[row + r], data[row + r + 1]);
    x = config.edgeProbePx;
    const edge = (inside: number, outside: number) => Math.min(1, Math.max(0, value(inside, y) - value(outside, y)));
    const sharpness = (edge(l + x, l - x) + edge(r - x, r + x)) / 2;
    return { run: { left, right }, sharpness };
  };

  /**
   * Follows the outline up (dir −1) or down (+1) from a point, row by row, through runs connected to the previous
   * row's run, and returns the sub-pixel row where it ends. Following the run (not one pixel column) copes with a
   * round head seen side-on or a foot pointing forward.
   */
  const traceEnd = (startX: number, startY: number, dir: -1 | 1): { y: number; clipped: boolean } | null => {
    let y = Math.round(startY);
    if (y < 0 || y >= H) return null;
    const first = runAt(y, startX);
    if (!first) return null;
    let run: SilhouetteRun = first.run;
    for (;;) {
      const next = y + dir;
      if (next < 0 || next >= H) return { y, clipped: true };
      // A run on the next row that overlaps this one: try the centre first, then any person pixel within the span.
      let found: SilhouetteRun | undefined = runAt(next, (run.left + run.right) / 2)?.run;
      if (!found) {
        for (let x = Math.max(0, Math.ceil(run.left)); x <= Math.min(W - 1, Math.floor(run.right)); x += 1) {
          if (data[next * W + x] >= t) {
            found = runAt(next, x)?.run;
            break;
          }
        }
      }
      if (!found) {
        const x = (run.left + run.right) / 2;
        return { y: crossing(y, next, value(x, y), value(x, next)), clipped: false };
      }
      run = found;
      y = next;
    }
  };

  // Head top: up from between the ears. Floor: down from each ankle; the lower foot is the floor contact.
  const head = traceEnd(ear.x, ear.y, -1);
  const headTopY = head ? (head.clipped ? 0 : head.y) : null;
  const headClipped = head?.clipped ?? false;
  let floorY: number | null = null;
  let floorClipped = false;
  for (const side of [LM.leftAnkle, LM.rightAnkle]) {
    const start = px(side);
    const foot = traceEnd(start.x, start.y, 1);
    if (!foot) continue;
    const bottom = foot.clipped ? H - 1 : foot.y;
    if (floorY === null || bottom > floorY) {
      floorY = bottom;
      floorClipped = foot.clipped;
    }
  }

  const rows: (SilhouetteRow | null)[] = new Array(H).fill(null);
  let crotchY: number | null = null;
  if (headTopY !== null && floorY !== null && floorY > headTopY) {
    for (let y = Math.ceil(headTopY); y <= Math.floor(floorY) && y < H; y += 1) {
      const c = runAt(y, lineX(centre, y));
      const belowHips = y >= hip.y;
      const l = belowHips ? runAt(y, lineX(leftLegLine, y)) : null;
      const r = belowHips ? runAt(y, lineX(rightLegLine, y)) : null;
      if (!c && !l && !r) continue;
      const sharp = c ? c.sharpness : ((l?.sharpness ?? 0) + (r?.sharpness ?? 0)) / ((l ? 1 : 0) + (r ? 1 : 0));
      rows[y] = { center: c?.run ?? null, leftLeg: l?.run ?? null, rightLeg: r?.run ?? null, sharpness: sharp };
      // Crotch: the first row below the hips where the centre line falls into a gap between two separate legs.
      if (crotchY === null && belowHips && y <= hip.y + config.maxCrotchDepth * (knee.y - hip.y) && !c && l && r) {
        const separate = l.run.right < r.run.left || r.run.right < l.run.left;
        if (separate) {
          const x = lineX(centre, y);
          const above = value(x, y - 1);
          crotchY = above >= t ? crossing(y - 1, y, above, value(x, y)) : y - 0.5;
        }
      }
    }
  }

  return { width: W, height: H, headTopY, floorY, crotchY, headClipped, floorClipped, rows };
}
