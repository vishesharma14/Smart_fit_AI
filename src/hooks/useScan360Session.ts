import { useCallback, useMemo, useReducer } from 'react';
import type { ScanCapture, ScanViewId } from '../types/scan';
import { coverageOf, initialScan360, nextView, scan360Reducer } from '../utils/scan360/session';

/** Guided 360° scan session: captured views, coverage and controls. Local to the scan page. */
export function useScan360Session() {
  const [state, dispatch] = useReducer(scan360Reducer, initialScan360);
  const start = useCallback(() => dispatch({ type: 'start' }), []);
  const pause = useCallback(() => dispatch({ type: 'pause' }), []);
  const resume = useCallback(() => dispatch({ type: 'resume' }), []);
  const restart = useCallback(() => dispatch({ type: 'restart' }), []);
  const finishEarly = useCallback(() => dispatch({ type: 'finish-early' }), []);
  const returnedToFront = useCallback(() => dispatch({ type: 'returned-to-front' }), []);
  const capture = useCallback(
    (view: ScanViewId, snapshot: ScanCapture) => dispatch({ type: 'capture', view, capture: snapshot }),
    [],
  );
  const coverage = useMemo(() => coverageOf(state), [state]);
  const target = useMemo(() => nextView(state), [state]);
  return { ...state, coverage, target, start, pause, resume, restart, finishEarly, returnedToFront, capture };
}

export type UseScan360Session = ReturnType<typeof useScan360Session>;
