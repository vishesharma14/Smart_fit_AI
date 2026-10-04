import type { PoseLandmark } from '../../types/pose';
import type { SilhouetteFrame, SilhouetteRun } from '../../types/silhouette';
import { LM } from '../pose/landmarks';
import { median } from './combine';
import { SILHOUETTE_CONFIG } from './silhouetteConfig';

/*
 * Where the clothing measurements are taken on an outline.
 *
 * Front / back views give each level's row (found from the joints plus the
 * outline: chest below the armpits, narrowest waist, widest hips, upper
 * thigh) and its width. Side views give the depth at the same height above
 * the floor, expressed as a fraction of stature so it carries across captures
 * taken at slightly different distances.
 */

export type LevelId = 'chest' | 'waist' | 'hip' | 'thigh';
export const LEVEL_IDS: LevelId[] = ['chest', 'waist', 'hip', 'thigh'];

export interface Level {
  /** Mask row of the level. */
  y: number;
  /** Height above the floor as a fraction of stature (0 = floor, 1 = head top). */
  heightFraction: number;
  /** Width (front / back) or depth (side) in mask pixels; for the thigh, one leg. */
  sizePx: number;
  /** 0–1 edge sharpness at the level. */
  sharpness: number;
}

/**
 * - `no-outline`: no usable outline (head top / floor not found)
 * - `arms-touching`: the arms or hands touch the body at that height in every row of the band
 * - `no-crotch`: the gap between the legs isn't visible (legs together, or long clothing)
 * - `not-visible`: the outline has no measurable rows there
 */
export type LevelFailure = 'no-outline' | 'arms-touching' | 'no-crotch' | 'not-visible';

export interface FrontLevels {
  /** Head top → floor in mask pixels, or null without a usable outline. */
  staturePx: number | null;
  levels: Partial<Record<LevelId, Level>>;
  failures: Partial<Record<LevelId, LevelFailure>>;
}

interface Pt {
  x: number;
  y: number;
}

const width = (run: SilhouetteRun): number => run.right - run.left;

/** x of a polyline at row y, or null when y is outside its vertical extent. */
function polylineXAt(points: Pt[], y: number): number | null {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y >= lo && y <= hi) return hi === lo ? (a.x + b.x) / 2 : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return null;
}

/** Each arm as shoulder → elbow → wrist → estimated hand tip, in mask pixels. */
export function armLines(landmarks: PoseLandmark[], frameWidth: number, frameHeight: number, config = SILHOUETTE_CONFIG): Pt[][] {
  const px = (i: number): Pt => ({ x: landmarks[i].x * frameWidth, y: landmarks[i].y * frameHeight });
  return [
    [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
    [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  ].map(([s, e, w]) => {
    const shoulder = px(s);
    const elbow = px(e);
    const wrist = px(w);
    const tip = {
      x: wrist.x + config.handExtension * (wrist.x - elbow.x),
      y: wrist.y + config.handExtension * (wrist.y - elbow.y),
    };
    return [shoulder, elbow, wrist, tip];
  });
}

/** True when no arm line crosses into the run at row y (the arms are clear of the torso there). */
function armsClear(run: SilhouetteRun, y: number, arms: Pt[][]): boolean {
  const centre = (run.left + run.right) / 2;
  return arms.every((arm) => {
    const x = polylineXAt(arm, y);
    if (x === null) return true;
    return x < centre ? run.left > x : run.right < x;
  });
}

/** True when a hand (wrist → tip) lies inside the run at row y. */
function handInside(run: SilhouetteRun, y: number, arms: Pt[][]): boolean {
  return arms.some((arm) => {
    const x = polylineXAt(arm.slice(2), y);
    return x !== null && x >= run.left && x <= run.right;
  });
}

/** Rows in [from, to] (clamped to the frame). */
function bandRows(frame: SilhouetteFrame, from: number, to: number): number[] {
  const rows: number[] = [];
  for (let y = Math.max(0, Math.ceil(from)); y <= Math.min(frame.height - 1, Math.floor(to)); y += 1) rows.push(y);
  return rows;
}

export function findFrontLevels(frame: SilhouetteFrame, landmarks: PoseLandmark[], config = SILHOUETTE_CONFIG): FrontLevels {
  const result: FrontLevels = { staturePx: null, levels: {}, failures: {} };
  const { headTopY, floorY } = frame;
  if (headTopY === null || floorY === null || !(floorY > headTopY) || landmarks.length < 33) {
    for (const id of LEVEL_IDS) result.failures[id] = 'no-outline';
    return result;
  }
  const stature = floorY - headTopY;
  result.staturePx = stature;
  const fraction = (y: number) => (floorY - y) / stature;
  const yOf = (i: number, j: number) => ((landmarks[i].y + landmarks[j].y) / 2) * frame.height;
  const shoulderY = yOf(LM.leftShoulder, LM.rightShoulder);
  const hipY = yOf(LM.leftHip, LM.rightHip);
  const torso = hipY - shoulderY;
  const arms = armLines(landmarks, frame.width, frame.height, config);
  if (!(torso > 0)) {
    for (const id of LEVEL_IDS) result.failures[id] = 'not-visible';
    return result;
  }

  /** Torso level: the widest or narrowest centre run in a band whose rows are clear of the arms. */
  const torsoLevel = (id: LevelId, rows: number[], pick: 'max' | 'min') => {
    const measured = rows.filter((y) => frame.rows[y]?.center);
    const clear = measured.filter((y) => armsClear(frame.rows[y]!.center!, y, arms));
    if (measured.length === 0) {
      result.failures[id] = 'not-visible';
      return;
    }
    if (clear.length === 0 || clear.length < config.minBandCoverage * rows.length) {
      result.failures[id] = 'arms-touching';
      return;
    }
    let best = clear[0];
    for (const y of clear) {
      const w = width(frame.rows[y]!.center!);
      const b = width(frame.rows[best]!.center!);
      if (pick === 'max' ? w > b : w < b) best = y;
    }
    const row = frame.rows[best]!;
    result.levels[id] = { y: best, heightFraction: fraction(best), sizePx: width(row.center!), sharpness: row.sharpness };
  };

  const band = (range: readonly [number, number]) => bandRows(frame, shoulderY + range[0] * torso, shoulderY + range[1] * torso);
  torsoLevel('chest', band(config.chestBand), 'max');
  torsoLevel('waist', band(config.waistBand), 'min');
  const hipBottom = frame.crotchY !== null ? frame.crotchY - 1 : hipY + config.hipFallbackBelow * torso;
  torsoLevel('hip', bandRows(frame, hipY - config.hipAbove * torso, hipBottom), 'max');

  // Upper thigh: just below the crotch, each leg separately, skipping rows where a hand rests on the leg.
  if (frame.crotchY === null) {
    result.failures.thigh = 'no-crotch';
  } else {
    const rows = bandRows(frame, frame.crotchY + config.thighBand[0] * stature, frame.crotchY + config.thighBand[1] * stature);
    const perLeg: { y: number; w: number; sharpness: number }[] = [];
    for (const side of ['leftLeg', 'rightLeg'] as const) {
      let best: { y: number; w: number; sharpness: number } | null = null;
      for (const y of rows) {
        const row = frame.rows[y];
        const leg = row?.[side];
        const other = row?.[side === 'leftLeg' ? 'rightLeg' : 'leftLeg'];
        // Only where the two legs are separate runs (otherwise both legs would be measured as one).
        if (!row || !leg || !other || !(leg.right < other.left || other.right < leg.left)) continue;
        if (handInside(leg, y, arms)) continue;
        if (!best || width(leg) > best.w) best = { y, w: width(leg), sharpness: row.sharpness };
      }
      if (best) perLeg.push(best);
    }
    if (perLeg.length === 0) {
      result.failures.thigh = 'not-visible';
    } else {
      const y = median(perLeg.map((l) => l.y));
      result.levels.thigh = {
        y,
        heightFraction: fraction(y),
        sizePx: median(perLeg.map((l) => l.w)),
        sharpness: median(perLeg.map((l) => l.sharpness)),
      };
    }
  }
  return result;
}

/**
 * Side-view depth at a height (fraction of stature): the median centre-run
 * width over a thin band around that row. Null without a usable outline or
 * when most of the band has no run.
 */
export function depthAt(frame: SilhouetteFrame, heightFraction: number, config = SILHOUETTE_CONFIG): Level | null {
  const { headTopY, floorY } = frame;
  if (headTopY === null || floorY === null || !(floorY > headTopY) || !Number.isFinite(heightFraction)) return null;
  const stature = floorY - headTopY;
  const y = floorY - heightFraction * stature;
  const half = Math.max(1, Math.round(config.depthBandHalf * stature));
  const rows = bandRows(frame, y - half, y + half);
  const runs = rows.flatMap((r) => {
    const row = frame.rows[r];
    return row?.center ? [{ w: width(row.center), sharpness: row.sharpness }] : [];
  });
  if (rows.length === 0 || runs.length * 2 <= rows.length) return null;
  return { y, heightFraction, sizePx: median(runs.map((r) => r.w)), sharpness: median(runs.map((r) => r.sharpness)) };
}

/** True when a hand hangs at row y (side views: it may widen the outline there). */
export function handAtRow(landmarks: PoseLandmark[], frame: SilhouetteFrame, y: number, config = SILHOUETTE_CONFIG): boolean {
  return armLines(landmarks, frame.width, frame.height, config).some((arm) => polylineXAt(arm.slice(2), y) !== null);
}

/**
 * Width of the body at a height (fraction of stature) in an angled view: like `depthAt`, but only rows where the
 * arms and hands are clear of the torso count, since an arm in front of or beside the torso would widen it.
 */
export function projectedWidthAt(
  frame: SilhouetteFrame,
  landmarks: PoseLandmark[],
  heightFraction: number,
  config = SILHOUETTE_CONFIG,
): Level | null {
  const { headTopY, floorY } = frame;
  if (headTopY === null || floorY === null || !(floorY > headTopY) || !Number.isFinite(heightFraction)) return null;
  const stature = floorY - headTopY;
  const y = floorY - heightFraction * stature;
  const half = Math.max(1, Math.round(config.depthBandHalf * stature));
  const rows = bandRows(frame, y - half, y + half);
  const arms = armLines(landmarks, frame.width, frame.height, config);
  const runs = rows.flatMap((r) => {
    const row = frame.rows[r];
    return row?.center && armsClear(row.center, r, arms) ? [{ w: width(row.center), sharpness: row.sharpness }] : [];
  });
  if (rows.length === 0 || runs.length * 2 <= rows.length) return null;
  return { y, heightFraction, sizePx: median(runs.map((r) => r.w)), sharpness: median(runs.map((r) => r.sharpness)) };
}
