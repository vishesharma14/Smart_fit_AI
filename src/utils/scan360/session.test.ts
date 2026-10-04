import { describe, expect, it } from 'vitest';
import type { ScanCapture, ScanViewId } from '../../types/scan';
import { makeSilhouetteCapture } from '../measurement/testFixtures';
import { coverageOf, initialScan360, nextView, scan360Reducer, type Scan360Action, type Scan360State } from './session';

const capture = (view: ScanViewId, patch: Partial<ScanCapture> = {}): Scan360Action => ({
  type: 'capture',
  view,
  capture: { ...makeSilhouetteCapture(view), ...patch },
});
const run = (actions: Scan360Action[], state: Scan360State = initialScan360) => actions.reduce(scan360Reducer, state);
const started = run([{ type: 'start' }]);
const CARDINALS: ScanViewId[] = ['front', 'left', 'back', 'right'];
const ALL: ScanViewId[] = ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'];

describe('scan360Reducer', () => {
  it('captures the front first, then other views in any order', () => {
    expect(run([capture('left')], started).captures.left).toBeUndefined();
    const state = run([capture('front'), capture('back'), capture('left')], started);
    expect(Object.keys(state.captures).sort()).toEqual(['back', 'front', 'left']);
    expect(state.lastCaptured).toBe('left');
  });

  it('never overwrites a view and rejects captures too close to a captured angle', () => {
    const first = run([capture('front')], started);
    expect(run([capture('front', { yawDeg: 5 })], first).captures.front).toBe(first.captures.front);
    // A "front-left" capture whose measured angle is only 20° from the front.
    expect(run([capture('front-left', { yawDeg: 20 })], first).captures['front-left']).toBeUndefined();
  });

  it('rejects a capture labelled for another view, and captures outside scanning', () => {
    expect(run([{ type: 'capture', view: 'front', capture: makeSilhouetteCapture('left') }], started).captures.front).toBeUndefined();
    expect(run([capture('front')]).captures.front).toBeUndefined();
    const paused = run([capture('front'), { type: 'pause' }, capture('left')], started);
    expect(paused.captures.left).toBeUndefined();
  });

  it('completes automatically after all eight views', () => {
    const state = run(ALL.map((v) => capture(v)), started);
    expect(state.status).toBe('finished');
    expect(coverageOf(state).complete).toBe(true);
  });

  it('completes after the four cardinal views once the user faces the camera again', () => {
    const cardinals = run(CARDINALS.map((v) => capture(v)), started);
    expect(cardinals.status).toBe('scanning');
    expect(coverageOf(cardinals)).toMatchObject({ cardinalsDone: true, complete: false });
    const done = run([{ type: 'returned-to-front' }], cardinals);
    expect(done).toMatchObject({ status: 'finished', closedCircle: true, finishedEarly: false });
  });

  it('ignores "returned to front" before the cardinal views are done', () => {
    const state = run([capture('front'), capture('left'), { type: 'returned-to-front' }], started);
    expect(state.status).toBe('scanning');
  });

  it('allows finishing early only with the front and a side view', () => {
    expect(run([capture('front'), capture('back'), { type: 'finish-early' }], started).status).toBe('scanning');
    const early = run([capture('front'), capture('right'), { type: 'finish-early' }], started);
    expect(early).toMatchObject({ status: 'finished', finishedEarly: true });
    expect(coverageOf(early).missingCardinal).toEqual(['left', 'back']);
  });

  it('restarts from nothing', () => {
    expect(run([capture('front'), { type: 'restart' }], started)).toEqual(initialScan360);
  });
});

describe('nextView', () => {
  it('guides to the front first, then onward in turning order', () => {
    expect(nextView(started)).toBe('front');
    const state = run([capture('front'), capture('left')], started);
    expect(nextView(state)).toBe('back-left');
    expect(nextView(run(ALL.map((v) => capture(v)), started))).toBeNull();
  });
});
