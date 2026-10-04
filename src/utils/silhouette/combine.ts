import type { SilhouetteFrame, SilhouetteProfile, SilhouetteRow, SilhouetteRun } from '../../types/silhouette';
import { SILHOUETTE_CONFIG } from './silhouetteConfig';

/*
 * A capture's outline: the per-row median of the outlines of its hold frames
 * (the person was holding still, so rows line up), which removes single-frame
 * mask flicker. A row's run is kept only when most frames have it.
 */

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const majority = (count: number, total: number): boolean => count * 2 > total;

function medianRun(runs: (SilhouetteRun | null)[]): SilhouetteRun | null {
  const present = runs.filter((run): run is SilhouetteRun => run !== null);
  if (!majority(present.length, runs.length)) return null;
  return { left: median(present.map((r) => r.left)), right: median(present.map((r) => r.right)) };
}

/** Median scalar over the frames that have one, or null when most frames don't. */
function medianOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return majority(present.length, values.length) ? median(present) : null;
}

/**
 * Combines the hold frames' outlines. Returns null when fewer than
 * `minFrames` usable outlines (same mask size, head and floor found) exist —
 * the capture then simply has no outline.
 */
export function combineSilhouetteFrames(
  frames: (SilhouetteFrame | null | undefined)[],
  config = SILHOUETTE_CONFIG,
): SilhouetteProfile | null {
  const found = frames.filter((f): f is SilhouetteFrame => !!f && f.headTopY !== null && f.floorY !== null);
  if (found.length === 0) return null;
  const { width, height } = found[0];
  const usable = found.filter((f) => f.width === width && f.height === height);
  if (usable.length < config.minFrames) return null;

  const n = usable.length;
  const rows: (SilhouetteRow | null)[] = new Array(height).fill(null);
  const jitters: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const frameRows = usable.map((f) => f.rows[y] ?? null);
    const present = frameRows.filter((r): r is SilhouetteRow => r !== null);
    if (!majority(present.length, n)) continue;
    const center = medianRun(frameRows.map((r) => r?.center ?? null));
    const leftLeg = medianRun(frameRows.map((r) => r?.leftLeg ?? null));
    const rightLeg = medianRun(frameRows.map((r) => r?.rightLeg ?? null));
    if (!center && !leftLeg && !rightLeg) continue;
    rows[y] = { center, leftLeg, rightLeg, sharpness: median(present.map((r) => r.sharpness)) };
    if (center) {
      const widths = frameRows.flatMap((r) => (r?.center ? [r.center.right - r.center.left] : []));
      const typical = median(widths);
      if (widths.length >= 3 && typical > 0) jitters.push(median(widths.map((w) => Math.abs(w - typical))) / typical);
    }
  }

  return {
    width,
    height,
    headTopY: medianOf(usable.map((f) => f.headTopY)),
    floorY: medianOf(usable.map((f) => f.floorY)),
    crotchY: medianOf(usable.map((f) => f.crotchY)),
    headClipped: majority(usable.filter((f) => f.headClipped).length, n),
    floorClipped: majority(usable.filter((f) => f.floorClipped).length, n),
    rows,
    frameCount: n,
    widthJitter: jitters.length > 0 ? median(jitters) : null,
  };
}
