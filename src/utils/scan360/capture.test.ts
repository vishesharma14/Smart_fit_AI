import { describe, expect, it } from 'vitest';
import type { PoseLandmark } from '../../types/pose';
import { makeCapture } from '../measurement/testFixtures';
import { extractSilhouetteFrame } from '../silhouette/extract';
import type { OutlineQuality } from '../silhouette/outlineQuality';
import { bodyLandmarks, renderBodyMask } from '../silhouette/testBody';
import {
  EMPTY_VIEW_HOLD,
  decideFrame,
  stepViewHold,
  type CapturedView,
  type FrameDecision,
  type FrameDecisionInput,
  type ScanViewConfig,
  type ViewHold,
  type ViewHoldSample,
} from './capture';

const CONFIG: ScanViewConfig = {
  viewHoldMs: 1000,
  viewMinFrames: 8,
  maxViewYawSpreadDeg: 12,
  viewToleranceDeg: 15,
  minViewSeparationDeg: 30,
  minYawConfidence: 0.5,
};
const GOOD_OUTLINE: OutlineQuality = { issue: null, staturePx: 600, sharpness: 1, disagreement: 0.05 };
const FRONT: CapturedView = { view: 'front', yawDeg: 2 };

const input = (patch: Partial<FrameDecisionInput> = {}): FrameDecisionInput => ({
  poseValid: true,
  lightingOk: true,
  moving: false,
  yaw: { yawDeg: 90, confidence: 0.9 },
  outline: GOOD_OUTLINE,
  captured: [FRONT],
  ...patch,
});

describe('decideFrame', () => {
  it('accepts a steady, valid frame inside an uncaptured view window', () => {
    expect(decideFrame(input(), CONFIG)).toEqual({ accept: true, view: 'left', reason: null });
    expect(decideFrame(input({ yaw: { yawDeg: 52, confidence: 0.8 } }), CONFIG).view).toBe('front-left');
  });

  it('rejects invalid frames: pose, lighting, outline, movement', () => {
    expect(decideFrame(input({ poseValid: false }), CONFIG).reason).toBe('pose');
    expect(decideFrame(input({ lightingOk: false }), CONFIG).reason).toBe('lighting');
    expect(decideFrame(input({ outline: { ...GOOD_OUTLINE, issue: 'feet-cut' } }), CONFIG).reason).toBe('outline');
    expect(decideFrame(input({ moving: true }), CONFIG).reason).toBe('moving');
  });

  it('rejects an unclear angle', () => {
    expect(decideFrame(input({ yaw: { yawDeg: 90, confidence: 0.3 } }), CONFIG).reason).toBe('angle-unclear');
    expect(decideFrame(input({ yaw: null }), CONFIG).reason).toBe('angle-unclear');
  });

  it('requires the front view first', () => {
    expect(decideFrame(input({ captured: [] }), CONFIG).reason).toBe('front-first');
    expect(decideFrame(input({ captured: [], yaw: { yawDeg: 5, confidence: 0.9 } }), CONFIG).accept).toBe(true);
  });

  it('rejects angles between view windows', () => {
    expect(decideFrame(input({ yaw: { yawDeg: 67, confidence: 0.9 } }), CONFIG)).toMatchObject({ accept: false, view: null, reason: 'between-views' });
  });

  it('rejects views already captured, or too close to a captured angle', () => {
    expect(decideFrame(input({ captured: [FRONT, { view: 'left', yawDeg: 88 }] }), CONFIG).reason).toBe('already-captured');
    // The front-left window, but only 20° from a front view captured at 15°.
    const near = decideFrame(input({ captured: [{ view: 'front', yawDeg: 15 }], yaw: { yawDeg: 35, confidence: 0.9 } }), CONFIG);
    expect(near).toMatchObject({ view: 'front-left', reason: 'already-captured' });
  });

  it('asks to keep turning (not hold still) when moving between or through captured views', () => {
    expect(decideFrame(input({ moving: true, yaw: { yawDeg: 67, confidence: 0.9 } }), CONFIG).reason).toBe('between-views');
  });
});

const front = makeCapture('front');
const outline = extractSilhouetteFrame(renderBodyMask('left'), bodyLandmarks('left'))!;
const shift = (landmarks: PoseLandmark[], dx: number) => landmarks.map((p) => ({ ...p, x: p.x + dx }));
function sample(i: number, patch: Partial<ViewHoldSample> = {}): ViewHoldSample {
  return {
    time: i * 150,
    landmarks: front.landmarks,
    worldLandmarks: front.worldLandmarks,
    silhouette: outline,
    yawDeg: 90 + (i % 3) - 1,
    staturePx: 600,
    widthRatio: 0.1,
    ...patch,
  };
}
const ACCEPT_LEFT: FrameDecision = { accept: true, view: 'left', reason: null };

function run(samples: ViewHoldSample[], decisions: FrameDecision[] = samples.map(() => ACCEPT_LEFT)) {
  let hold: ViewHold = EMPTY_VIEW_HOLD;
  const results = samples.map((s, i) => {
    const step = stepViewHold(hold, decisions[i], decisions[i].accept ? s : null, s.time, CONFIG);
    hold = step.hold;
    return step;
  });
  return { results, hold };
}

describe('stepViewHold', () => {
  it('captures after enough steady frames, with median landmarks, angle and outline', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(i));
    const { results } = run(samples);
    expect(results.slice(0, 7).every((r) => r.capture === null)).toBe(true);
    const capture = results[7].capture!;
    expect(capture.view).toBe('left');
    expect(capture.sampleCount).toBe(8);
    expect(capture.yawDeg).toBeCloseTo(90, 0);
    expect(capture.silhouette.frameCount).toBe(8);
  });

  it('is robust to one jumpy frame (median, not mean)', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(i, i === 3 ? { landmarks: shift(front.landmarks, 0.2) } : {}));
    const capture = run(samples).results[7].capture!;
    expect(capture.landmarks[0].x).toBeCloseTo(front.landmarks[0].x, 10);
  });

  it('needs the hold time as well as the frame count', () => {
    const fast = Array.from({ length: 8 }, (_, i) => sample(i, { time: i * 50 }));
    expect(run(fast).results.every((r) => r.capture === null)).toBe(true);
  });

  it('starts over on a rejected frame or a different view', () => {
    const samples = Array.from({ length: 9 }, (_, i) => sample(i));
    const decisions = samples.map((_, i) => (i === 4 ? { accept: false, view: 'left' as const, reason: 'moving' as const } : ACCEPT_LEFT));
    expect(run(samples, decisions).results.every((r) => r.capture === null)).toBe(true);
    const switched = samples.map((_, i) => (i < 4 ? { accept: true, view: 'front-left' as const, reason: null } : ACCEPT_LEFT));
    const { results, hold } = run(samples, switched);
    expect(results.every((r) => r.capture === null)).toBe(true);
    expect(hold.view).toBe('left');
    expect(hold.samples).toHaveLength(5);
  });

  it('discards a hold whose angle drifted', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(i, { yawDeg: 80 + i * 3 }));
    expect(run(samples).results[7]).toMatchObject({ capture: null, failure: 'angle-drift' });
  });

  it('discards a hold whose outline height was unstable', () => {
    const samples = Array.from({ length: 8 }, (_, i) => sample(i, { staturePx: i === 5 ? 560 : 600 }));
    expect(run(samples).results[7]).toMatchObject({ capture: null, failure: 'outline-unstable' });
  });
});
