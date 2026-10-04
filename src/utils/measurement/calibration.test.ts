import { describe, expect, it } from 'vitest';
import { LM } from '../pose/landmarks';
import {
  applyCalibration,
  calibrateFromUserHeight,
  chooseCalibration,
  poseModelMetricCalibration,
  statureSample,
  UNCALIBRATED,
} from './calibration';
import { makeCapture, STANDING_STATURE, withVisibility } from './testFixtures';

describe('statureSample', () => {
  it('measures head top (extrapolated above the ears) to heels', () => {
    expect(statureSample(makeCapture('front'))!.value).toBeCloseTo(STANDING_STATURE, 6);
  });

  it('is unaffected by the body turning', () => {
    expect(statureSample(makeCapture('back'))!.value).toBeCloseTo(STANDING_STATURE, 6);
  });

  it('is null when the heels or ears are not clearly visible', () => {
    const capture = makeCapture('front');
    expect(statureSample({ ...capture, landmarks: withVisibility(capture.landmarks, [LM.leftHeel], 0.2) })).toBeNull();
    expect(statureSample({ ...capture, landmarks: withVisibility(capture.landmarks, [LM.rightEar], 0.1) })).toBeNull();
  });

  it('is null for a non-upright (degenerate) pose', () => {
    const capture = makeCapture('front');
    const lying = capture.worldLandmarks.map((p) => ({ ...p, x: p.y, y: p.x * 0.1 }));
    expect(statureSample({ ...capture, worldLandmarks: lying })).toBeNull();
  });
});

describe('calibrateFromUserHeight', () => {
  const captures = [makeCapture('front'), makeCapture('left'), makeCapture('back')];

  it('scales by entered height ÷ measured stature', () => {
    const result = calibrateFromUserHeight(170, captures)!;
    expect(result.method).toBe('user-height');
    expect(result.cmPerUnit).toBeCloseTo(170 / STANDING_STATURE, 6);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('works whatever the model scale is (no pixel or metre assumption)', () => {
    const scaled = [makeCapture('front', { scale: 0.5 }), makeCapture('back', { scale: 0.5 })];
    expect(calibrateFromUserHeight(170, scaled)!.cmPerUnit).toBeCloseTo((2 * 170) / STANDING_STATURE, 6);
  });

  it('is less confident from a single view than from front and back', () => {
    const one = calibrateFromUserHeight(170, [makeCapture('front')])!;
    const two = calibrateFromUserHeight(170, captures)!;
    expect(one.confidence).toBeLessThan(two.confidence);
  });

  it('is null without a plausible height', () => {
    expect(calibrateFromUserHeight(null, captures)).toBeNull();
    expect(calibrateFromUserHeight(undefined, captures)).toBeNull();
    expect(calibrateFromUserHeight(Number.NaN, captures)).toBeNull();
    expect(calibrateFromUserHeight(20, captures)).toBeNull();
    expect(calibrateFromUserHeight(400, captures)).toBeNull();
  });

  it('is null without a full-body front or back capture', () => {
    expect(calibrateFromUserHeight(170, [])).toBeNull();
    expect(calibrateFromUserHeight(170, [makeCapture('left'), makeCapture('right')])).toBeNull();
    const front = makeCapture('front');
    const noFeet = { ...front, landmarks: withVisibility(front.landmarks, [LM.leftHeel, LM.rightHeel], 0) };
    expect(calibrateFromUserHeight(170, [noFeet])).toBeNull();
  });
});

describe('chooseCalibration', () => {
  it('prefers the most confident calibration with a usable scale', () => {
    const user = calibrateFromUserHeight(170, [makeCapture('front'), makeCapture('back')]);
    expect(chooseCalibration([user, poseModelMetricCalibration()]).method).toBe('user-height');
    expect(chooseCalibration([null, poseModelMetricCalibration()]).method).toBe('pose-model-metric');
  });

  it('falls back to uncalibrated, ignoring unusable scales', () => {
    expect(chooseCalibration([])).toBe(UNCALIBRATED);
    const broken = { ...poseModelMetricCalibration(), cmPerUnit: Number.NaN };
    expect(chooseCalibration([broken, null])).toBe(UNCALIBRATED);
  });
});

describe('applyCalibration', () => {
  it('converts to centimetres with a scale', () => {
    expect(applyCalibration(0.4, poseModelMetricCalibration())).toEqual({ value: 40, unit: 'cm' });
  });

  it('keeps model units without a scale', () => {
    expect(applyCalibration(0.4, UNCALIBRATED)).toEqual({ value: 0.4, unit: 'model-units' });
  });
});
