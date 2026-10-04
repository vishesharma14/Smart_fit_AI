import type { ScanPhaseId, ScanViewId } from '../../types/scan';

/*
 * The guided 360° scan's views. Each has a target body angle (0° facing the
 * camera, increasing as the user turns to their left) and an acceptance
 * window: frames anywhere inside it can make up that view, and the capture
 * keeps the angle actually measured. Angles are never assigned from timers.
 */

export interface ScanViewDefinition {
  id: ScanViewId;
  /** Target body angle, degrees. */
  yawDeg: number;
  /** Cardinal views carry the main measurement geometry (width, depth); diagonal views check it. */
  kind: 'cardinal' | 'diagonal';
  label: string;
  /** Spoken / shown when captured, e.g. "Side view captured". */
  capturedLabel: string;
}

/** In turning order (to the user's left). */
export const SCAN_VIEWS: ScanViewDefinition[] = [
  { id: 'front', yawDeg: 0, kind: 'cardinal', label: 'Front', capturedLabel: 'Front view captured' },
  { id: 'front-left', yawDeg: 45, kind: 'diagonal', label: 'Front-left', capturedLabel: 'Angle view captured' },
  { id: 'left', yawDeg: 90, kind: 'cardinal', label: 'Left side', capturedLabel: 'Side view captured' },
  { id: 'back-left', yawDeg: 135, kind: 'diagonal', label: 'Back-left', capturedLabel: 'Angle view captured' },
  { id: 'back', yawDeg: 180, kind: 'cardinal', label: 'Back', capturedLabel: 'Back view captured' },
  { id: 'back-right', yawDeg: 225, kind: 'diagonal', label: 'Back-right', capturedLabel: 'Angle view captured' },
  { id: 'right', yawDeg: 270, kind: 'cardinal', label: 'Right side', capturedLabel: 'Side view captured' },
  { id: 'front-right', yawDeg: 315, kind: 'diagonal', label: 'Front-right', capturedLabel: 'Angle view captured' },
];

export const CARDINAL_VIEWS: ScanPhaseId[] = ['front', 'left', 'back', 'right'];

export const VIEW_BY_ID = Object.fromEntries(SCAN_VIEWS.map((view) => [view.id, view])) as Record<ScanViewId, ScanViewDefinition>;

export const isCardinal = (id: ScanViewId): id is ScanPhaseId => VIEW_BY_ID[id].kind === 'cardinal';

/** Normalises an angle to 0–360. */
export function wrapDeg(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Smallest absolute difference between two angles, 0–180. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(wrapDeg(a) - wrapDeg(b));
  return d > 180 ? 360 - d : d;
}

/** Circular median-like centre of a set of angles: the sample angle with the smallest summed distance to the others. */
export function centralAngle(angles: number[]): number | null {
  if (angles.length === 0) return null;
  let best = angles[0];
  let bestCost = Infinity;
  for (const candidate of angles) {
    const cost = angles.reduce((sum, a) => sum + angularDistance(candidate, a), 0);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return wrapDeg(best);
}

/** Largest pairwise angular distance in a set (how much the angle drifted). */
export function angularSpread(angles: number[]): number {
  let spread = 0;
  for (let i = 0; i < angles.length; i += 1) {
    for (let j = i + 1; j < angles.length; j += 1) spread = Math.max(spread, angularDistance(angles[i], angles[j]));
  }
  return spread;
}

/** The view whose acceptance window contains the angle, or null between windows. */
export function viewAt(yawDeg: number, toleranceDeg: number): ScanViewId | null {
  for (const view of SCAN_VIEWS) if (angularDistance(yawDeg, view.yawDeg) <= toleranceDeg) return view.id;
  return null;
}

/** The view nearest to the angle (for labels), whatever the window. */
export function nearestView(yawDeg: number): ScanViewDefinition {
  let best = SCAN_VIEWS[0];
  for (const view of SCAN_VIEWS) if (angularDistance(yawDeg, view.yawDeg) < angularDistance(yawDeg, best.yawDeg)) best = view;
  return best;
}
