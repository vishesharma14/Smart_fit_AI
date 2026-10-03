import { describe, expect, it } from 'vitest';
import type { Measurement, MeasurementId } from '../../types/measurement';
import { LM } from '../pose/landmarks';
import { measureScan } from './measureScan';
import { makeCapture, makeCaptures, STANDING_STATURE, withVisibility } from './testFixtures';

const byId = (measurements: Measurement[], id: MeasurementId) => measurements.find((m) => m.id === id)!;

describe('measureScan – regions', () => {
  it('upper body: shoulder, arm, torso, and girths marked unsupported', () => {
    const report = measureScan({ captures: makeCaptures(undefined, { scanRegion: 'upper' }), region: 'upper' });
    expect(report.measurements.map((m) => m.id)).toEqual(['shoulder-width', 'arm-length', 'torso-length', 'chest', 'waist']);
  });

  it('lower body: waist, hip, thigh, leg length and inseam', () => {
    const report = measureScan({ captures: makeCaptures(undefined, { scanRegion: 'lower' }), region: 'lower' });
    expect(report.measurements.map((m) => m.id)).toEqual(['waist', 'hip', 'thigh', 'leg-length', 'inseam']);
  });

  it('never gives a value for girths or inseam', () => {
    const report = measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 170 });
    for (const id of ['chest', 'waist', 'hip', 'thigh', 'inseam'] as const) {
      const m = byId(report.measurements, id);
      expect(m.status).toBe('unsupported');
      expect(m.value).toBeNull();
      expect(m.confidence).toBe(0);
      expect(m.source.method).toBe('not-measurable');
      expect(m.reason).toBeTruthy();
    }
  });
});

describe('measureScan – known geometry', () => {
  it("uses the pose model's metric scale only as an uncertain fallback", () => {
    const report = measureScan({ captures: makeCaptures(), region: 'full' });
    expect(report.calibration.method).toBe('pose-model-metric');
    const shoulders = byId(report.measurements, 'shoulder-width');
    expect(shoulders).toMatchObject({ value: 40, unit: 'cm', status: 'uncertain' });
    expect(shoulders.reason).toMatch(/pose model's own estimate/);
    expect(byId(report.measurements, 'arm-length').value).toBe(55);
    expect(byId(report.measurements, 'torso-length').value).toBe(45);
    expect(byId(report.measurements, 'leg-length').value).toBe(84);
    expect(report.measurements.every((m) => m.status !== 'valid')).toBe(true);
  });

  it('calibrates from the entered height and marks well-supported lengths valid', () => {
    const report = measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 170 });
    const scale = 170 / STANDING_STATURE;
    expect(report.calibration.method).toBe('user-height');
    const shoulders = byId(report.measurements, 'shoulder-width');
    expect(shoulders.value).toBe(Math.round(0.4 * scale * 10) / 10);
    expect(shoulders.status).toBe('valid');
    expect(shoulders.reason).toBeUndefined();
    expect(shoulders.source).toMatchObject({ angles: ['front', 'back'], sampleCount: 2, calibration: 'user-height' });
    const legs = byId(report.measurements, 'leg-length');
    expect(legs.value).toBe(Math.round(0.84 * scale * 10) / 10);
    expect(legs.source.angles).toEqual(['front', 'left', 'back', 'right']);
    expect(legs.source.sampleCount).toBe(8);
  });

  it('scales with the entered height (no hard-coded body size)', () => {
    const short = measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 150 });
    const tall = measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 190 });
    const a = byId(short.measurements, 'arm-length').value!;
    const b = byId(tall.measurements, 'arm-length').value!;
    expect(b / a).toBeCloseTo(190 / 150, 2);
  });

  it('is deterministic', () => {
    const input = { captures: makeCaptures(), region: 'full' as const, userHeightCm: 172 };
    expect(measureScan(input)).toEqual(measureScan(input));
  });
});

describe('measureScan – missing or poor data', () => {
  it('marks measurements invalid with no captures', () => {
    const report = measureScan({ captures: {}, region: 'upper', userHeightCm: 170 });
    expect(report.anglesUsed).toEqual([]);
    expect(report.calibration.method).toBe('pose-model-metric');
    const shoulders = byId(report.measurements, 'shoulder-width');
    expect(shoulders).toMatchObject({ value: null, status: 'invalid', confidence: 0 });
    expect(shoulders.reason).toMatch(/No usable capture/);
  });

  it('marks a measurement invalid when its landmarks are not visible', () => {
    const captures = makeCaptures();
    for (const capture of Object.values(captures)) {
      capture!.landmarks = withVisibility(capture!.landmarks, [LM.leftWrist, LM.rightWrist], 0.2);
    }
    const report = measureScan({ captures, region: 'full', userHeightCm: 170 });
    const arm = byId(report.measurements, 'arm-length');
    expect(arm).toMatchObject({ value: null, status: 'invalid' });
    expect(arm.reason).toMatch(/not clearly visible/);
    expect(byId(report.measurements, 'shoulder-width').status).toBe('valid');
  });

  it('ignores non-finite landmark coordinates', () => {
    const front = makeCapture('front');
    front.worldLandmarks[LM.leftShoulder] = { ...front.worldLandmarks[LM.leftShoulder], x: Number.NaN };
    const report = measureScan({ captures: { front }, region: 'full' });
    expect(byId(report.measurements, 'shoulder-width').status).toBe('invalid');
  });

  it('is less confident with fewer angles', () => {
    const all = measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 170 });
    const some = measureScan({ captures: makeCaptures(['front', 'left']), region: 'full', userHeightCm: 170 });
    expect(byId(some.measurements, 'leg-length').confidence).toBeLessThan(byId(all.measurements, 'leg-length').confidence);
    expect(byId(some.measurements, 'leg-length').reason).toMatch(/back, right/);
  });

  it('is less confident when angles disagree', () => {
    const captures = { ...makeCaptures(['front', 'left', 'right']), back: makeCapture('back', { scale: 1.3 }) };
    const agreeing = measureScan({ captures: makeCaptures(), region: 'full' });
    const disagreeing = measureScan({ captures, region: 'full' });
    expect(byId(disagreeing.measurements, 'shoulder-width').confidence).toBeLessThan(
      byId(agreeing.measurements, 'shoulder-width').confidence,
    );
  });

  it('ignores captures from another region, mislabelled or with incomplete landmarks', () => {
    const front = makeCapture('front', { scanRegion: 'lower' });
    const back = makeCapture('left');
    const left = makeCapture('left');
    left.landmarks = left.landmarks.slice(0, 20);
    const report = measureScan({ captures: { front, back, left, right: makeCapture('right') }, region: 'full' });
    expect(report.anglesUsed).toEqual(['right']);
    expect(report.warnings).toHaveLength(3);
  });

  it('cannot calibrate from height on an upper-body scan (feet not captured)', () => {
    const captures = makeCaptures(undefined, { scanRegion: 'upper' });
    for (const capture of Object.values(captures)) {
      capture!.landmarks = withVisibility(capture!.landmarks, [LM.leftHeel, LM.rightHeel], 0.05);
    }
    const report = measureScan({ captures, region: 'upper', userHeightCm: 170 });
    expect(report.calibration.method).toBe('pose-model-metric');
    expect(report.measurements.some((m) => m.status === 'valid')).toBe(false);
  });
});
