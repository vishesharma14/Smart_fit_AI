import { useCallback, useReducer } from 'react';
import type { ScanCapture, ScanPhaseId, ScanPhaseStatus, ScanSessionStatus } from '../types/scan';
import { SCAN_PHASES } from '../utils/scanPhases';

export interface ScanSessionState {
  status: ScanSessionStatus;
  /** Index into SCAN_PHASES of the angle being guided. */
  phaseIndex: number;
  phases: Record<ScanPhaseId, ScanPhaseStatus>;
  /** Validated landmark snapshots, at most one per angle and never overwritten (no images). */
  captures: Partial<Record<ScanPhaseId, ScanCapture>>;
}

export type ScanSessionAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  /** The pose model confirmed the current angle for the full hold time. */
  | { type: 'capture'; phase: ScanPhaseId; capture: ScanCapture };

const allPending = (): Record<ScanPhaseId, ScanPhaseStatus> => ({
  front: 'pending',
  left: 'pending',
  back: 'pending',
  right: 'pending',
});

export const initialScanSession: ScanSessionState = { status: 'ready', phaseIndex: 0, phases: allPending(), captures: {} };

/** Scan session state transitions (exported for verification; use `useScanSession` in components). */
export function scanSessionReducer(state: ScanSessionState, action: ScanSessionAction): ScanSessionState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'ready') return state;
      return { ...initialScanSession, status: 'scanning', phases: { ...allPending(), [SCAN_PHASES[0].id]: 'active' } };
    case 'pause':
      return state.status === 'scanning' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'scanning' } : state;
    case 'restart':
      return initialScanSession;
    case 'capture': {
      const current = SCAN_PHASES[state.phaseIndex];
      // Only the active angle can be captured, once: a late capture after pause or restart, a capture for a
      // different angle, or a second capture of a locked (already captured) angle is ignored.
      if (state.status !== 'scanning' || action.phase !== current.id) return state;
      if (state.phases[current.id] === 'captured' || state.captures[current.id]) return state;
      if (action.capture.phase !== current.id) return state;
      const next = SCAN_PHASES[state.phaseIndex + 1];
      const phases = { ...state.phases, [current.id]: 'captured' as const };
      const captures = { ...state.captures, [current.id]: action.capture };
      if (!next) return { ...state, status: 'finished', phases, captures };
      return { status: 'scanning', phaseIndex: state.phaseIndex + 1, phases: { ...phases, [next.id]: 'active' }, captures };
    }
  }
}

/** Scan angle sequence (front → left → back → right) and session controls. Local to the scan page. */
export function useScanSession() {
  const [state, dispatch] = useReducer(scanSessionReducer, initialScanSession);
  const start = useCallback(() => dispatch({ type: 'start' }), []);
  const pause = useCallback(() => dispatch({ type: 'pause' }), []);
  const resume = useCallback(() => dispatch({ type: 'resume' }), []);
  const restart = useCallback(() => dispatch({ type: 'restart' }), []);
  const capture = useCallback(
    (phase: ScanPhaseId, snapshot: ScanCapture) => dispatch({ type: 'capture', phase, capture: snapshot }),
    [],
  );
  return { ...state, currentPhase: SCAN_PHASES[state.phaseIndex], start, pause, resume, restart, capture };
}

export type UseScanSession = ReturnType<typeof useScanSession>;
