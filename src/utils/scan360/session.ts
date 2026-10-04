import type { ScanCapture, ScanSessionStatus, ScanViewId } from '../../types/scan';
import { POSE_SCAN_CONFIG } from '../pose/poseConfig';
import { angularDistance, CARDINAL_VIEWS, SCAN_VIEWS } from './views';

/*
 * The 360° scan session: which views are captured and when the scan is
 * complete. Pure, so the rules are testable.
 *
 * Complete when all eight views are captured, or when the four cardinal views
 * (front, both sides, back — the geometry the measurements need) are captured
 * and the user has turned back to face the camera, closing the circle. The
 * angled views are captured whenever the user passes through them steadily;
 * they add checks, not required geometry.
 *
 * "Finish early" is only possible with the front and at least one side view:
 * fewer views than that can't give any girth (width and depth are both needed).
 */

export interface Scan360State {
  status: ScanSessionStatus;
  /** At most one capture per view, never overwritten. Landmarks and outline numbers only. */
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  /** Most recent capture, for the confirmation message. */
  lastCaptured: ScanViewId | null;
  /** The user turned back to face the camera after the cardinal views. */
  closedCircle: boolean;
  /** Finished before full coverage, at the user's request. */
  finishedEarly: boolean;
}

export type Scan360Action =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'capture'; view: ScanViewId; capture: ScanCapture }
  | { type: 'returned-to-front' }
  | { type: 'finish-early' };

export const initialScan360: Scan360State = {
  status: 'ready',
  captures: {},
  lastCaptured: null,
  closedCircle: false,
  finishedEarly: false,
};

export interface Coverage {
  captured: ScanViewId[];
  missingCardinal: ScanViewId[];
  angledCaptured: number;
  /** All four cardinal views captured. */
  cardinalsDone: boolean;
  complete: boolean;
  /** Enough views to finish early (front + a side view). */
  canFinishEarly: boolean;
}

export function coverageOf(state: Pick<Scan360State, 'captures' | 'closedCircle'>): Coverage {
  const captured = SCAN_VIEWS.map((v) => v.id).filter((id) => state.captures[id]);
  const missingCardinal = CARDINAL_VIEWS.filter((id) => !state.captures[id]);
  const cardinalsDone = missingCardinal.length === 0;
  return {
    captured,
    missingCardinal,
    angledCaptured: captured.length - (CARDINAL_VIEWS.length - missingCardinal.length),
    cardinalsDone,
    complete: captured.length === SCAN_VIEWS.length || (cardinalsDone && state.closedCircle),
    canFinishEarly: !!state.captures.front && !!(state.captures.left || state.captures.right),
  };
}

/** The next view to guide toward: the first uncaptured view in turning order after the last capture (front first). */
export function nextView(state: Pick<Scan360State, 'captures' | 'lastCaptured'>): ScanViewId | null {
  if (!state.captures.front) return 'front';
  const order = SCAN_VIEWS.map((v) => v.id);
  const start = state.lastCaptured ? order.indexOf(state.lastCaptured) : 0;
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(start + step) % order.length];
    if (!state.captures[id]) return id;
  }
  return null;
}

/** Session transitions (use `useScan360Session` in components). */
export function scan360Reducer(state: Scan360State, action: Scan360Action): Scan360State {
  switch (action.type) {
    case 'start':
      return state.status === 'ready' ? { ...initialScan360, status: 'scanning' } : state;
    case 'pause':
      return state.status === 'scanning' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'scanning' } : state;
    case 'restart':
      return initialScan360;
    case 'capture': {
      const { view, capture } = action;
      // Only while scanning, once per view, for the view it was built for, front first, and well away from
      // every captured view's angle. Anything else (a late capture after pause / restart, a duplicate) is ignored.
      if (state.status !== 'scanning' || state.captures[view] || capture.phase !== view) return state;
      if (!state.captures.front && view !== 'front') return state;
      const yaw = capture.yawDeg;
      const tooClose =
        yaw !== undefined &&
        Object.values(state.captures).some(
          (c) => c.yawDeg !== undefined && angularDistance(c.yawDeg, yaw) < POSE_SCAN_CONFIG.minViewSeparationDeg,
        );
      if (tooClose) return state;
      const next: Scan360State = { ...state, captures: { ...state.captures, [view]: capture }, lastCaptured: view };
      return coverageOf(next).complete ? { ...next, status: 'finished' } : next;
    }
    case 'returned-to-front': {
      if (state.status !== 'scanning' || !coverageOf(state).cardinalsDone) return state;
      return { ...state, closedCircle: true, status: 'finished' };
    }
    case 'finish-early':
      if ((state.status !== 'scanning' && state.status !== 'paused') || !coverageOf(state).canFinishEarly) return state;
      return { ...state, status: 'finished', finishedEarly: true };
  }
}
