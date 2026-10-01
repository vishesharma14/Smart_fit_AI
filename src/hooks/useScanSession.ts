import { useReducer } from 'react';
import type { ScanPhaseId, ScanPhaseStatus, ScanSessionStatus } from '../types/scan';
import { SCAN_PHASES } from '../utils/scanPhases';

export interface ScanSessionState {
  status: ScanSessionStatus;
  /** Index into SCAN_PHASES of the angle being guided. */
  phaseIndex: number;
  phases: Record<ScanPhaseId, ScanPhaseStatus>;
}

type ScanSessionAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  /** Detection engine confirmed the current angle. */
  | { type: 'capture' }
  /** Move on without capturing (guidance preview only). */
  | { type: 'preview-next' };

const allPending = (): Record<ScanPhaseId, ScanPhaseStatus> => ({
  front: 'pending',
  left: 'pending',
  back: 'pending',
  right: 'pending',
});

const initialState: ScanSessionState = { status: 'ready', phaseIndex: 0, phases: allPending() };

/** Marks the current angle `done` and activates the next, or finishes after the last. */
function advance(state: ScanSessionState, done: 'captured' | 'previewed'): ScanSessionState {
  const current = SCAN_PHASES[state.phaseIndex];
  const next = SCAN_PHASES[state.phaseIndex + 1];
  const phases = { ...state.phases, [current.id]: done };
  if (!next) return { ...state, status: 'finished', phases };
  return { status: 'scanning', phaseIndex: state.phaseIndex + 1, phases: { ...phases, [next.id]: 'active' } };
}

function reducer(state: ScanSessionState, action: ScanSessionAction): ScanSessionState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'ready') return state;
      return { status: 'scanning', phaseIndex: 0, phases: { ...allPending(), [SCAN_PHASES[0].id]: 'active' } };
    case 'pause':
      return state.status === 'scanning' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'scanning' } : state;
    case 'restart':
      return initialState;
    case 'capture':
      return state.status === 'scanning' ? advance(state, 'captured') : state;
    case 'preview-next':
      return state.status === 'scanning' ? advance(state, 'previewed') : state;
  }
}

/** Scan angle sequence (front → left → back → right) and session controls. Local to the scan page. */
export function useScanSession() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return {
    ...state,
    currentPhase: SCAN_PHASES[state.phaseIndex],
    start: () => dispatch({ type: 'start' }),
    pause: () => dispatch({ type: 'pause' }),
    resume: () => dispatch({ type: 'resume' }),
    restart: () => dispatch({ type: 'restart' }),
    capture: () => dispatch({ type: 'capture' }),
    previewNext: () => dispatch({ type: 'preview-next' }),
  };
}

export type UseScanSession = ReturnType<typeof useScanSession>;
