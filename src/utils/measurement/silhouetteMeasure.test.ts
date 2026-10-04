import { describe, expect, it } from 'vitest';
import type { Measurement, MeasurementId } from '../../types/measurement';
import { BODY } from '../silhouette/testBody';
import { silhouetteScale } from './calibration';
import { measureScan } from './measureScan';
import { ellipsePerimeter } from './silhouetteMeasure';
import { makeCapture, makeSilhouetteCapture, makeSilhouetteCaptures } from './testFixtures';

const byId = (measurements: Measurement[], id: MeasurementId) => measurements.find((m) => m.id === id)!;
const girth = (width: number, depth: number) => ellipsePerimeter(width / 2, depth / 2);
const full = (captures = makeSilhouetteCaptures(), userHeightCm: number | null = BODY.statureCm) =>
  measureScan({ captures, region: 'full', userHeightCm });

describe('ellipsePerimeter', () => {
  it('is exact for a circle and between the bounds for an ellipse', () => {
    expect(ellipsePerimeter(10, 10)).toBeCloseTo(2 * Math.PI * 10, 10);
    const p = ellipsePerimeter(16, 12);
    // Known bounds: 4·√(a²+b²) ≤ P ≤ π·√(2(a²+b²)).
    expect(p).toBeGreaterThan(4 * Math.hypot(16, 12));
    expect(p).toBeLessThan(Math.PI * Math.sqrt(2 * (16 ** 2 + 12 ** 2)));
  });
});

describe('silhouetteScale', () => {
  it('scales each capture by entered height ÷ outline stature', () => {
    expect(silhouetteScale(makeSilhouetteCapture('front'), 175)!.cmPerPx).toBeCloseTo(175 / 600, 4);
    // A capture taken closer to the camera gets its own, smaller cm-per-pixel.
    const near = makeSilhouetteCapture('left', { pxPerCm: 3.8, floorY: 690 });
    expect(silhouetteScale(near, 175)!.cmPerPx).toBeCloseTo(1 / 3.8, 3);
  });

  it('is null without a plausible height, an outline, or with the head cut off', () => {
    const capture = makeSilhouetteCapture('front');
    expect(silhouetteScale(capture, null)).toBeNull();
    expect(silhouetteScale(capture, 20)).toBeNull();
    expect(silhouetteScale(makeCapture('front'), 175)).toBeNull();
    expect(silhouetteScale(makeSilhouetteCapture('front', { floorY: 590 }), 175)).toBeNull();
  });

  it('distrusts an outline whose height disagrees strongly with the joints', () => {
    const capture = makeSilhouetteCapture('front');
    const merged = { ...capture, silhouette: { ...capture.silhouette!, headTopY: capture.silhouette!.headTopY! - 250 } };
    expect(silhouetteScale(merged, 175)).toBeNull();
  });
});

describe('outline measurements in measureScan', () => {
  it('reproduces the synthetic body’s girths and inseam', () => {
    const report = full();
    expect(byId(report.measurements, 'chest').value).toBeCloseTo(girth(BODY.front.chest, BODY.side.chest), 0);
    expect(byId(report.measurements, 'waist').value).toBeCloseTo(girth(BODY.front.waist, BODY.side.waist), 0);
    expect(byId(report.measurements, 'hip').value).toBeCloseTo(girth(BODY.front.hip, BODY.side.hip), 0);
    expect(byId(report.measurements, 'thigh').value).toBeCloseTo(girth(BODY.front.thigh, BODY.side.thigh), 0);
    expect(byId(report.measurements, 'inseam').value).toBeCloseTo(BODY.crotchCm, 0);
  });

  it('caps every outline measurement at uncertain, with the validation note', () => {
    for (const id of ['chest', 'waist', 'hip', 'thigh', 'inseam'] as const) {
      const m = byId(full().measurements, id);
      expect(m.status).toBe('uncertain');
      expect(m.reason).toMatch(/not yet validated against tape measurements/);
      expect(m.source).toMatchObject({ method: 'silhouette-geometry', calibration: 'silhouette-height' });
      expect(m.unit).toBe('cm');
    }
  });

  it('keeps joint lengths unchanged (still valid with the height calibration)', () => {
    expect(byId(full().measurements, 'shoulder-width').status).toBe('valid');
  });

  it('scales with the entered height (no fixed body size)', () => {
    const a = byId(full(undefined, 175).measurements, 'waist').value!;
    const b = byId(full(undefined, 189).measurements, 'waist').value!;
    expect(b / a).toBeCloseTo(189 / 175, 2);
  });

  it('is unaffected by the person standing slightly nearer or further in different views', () => {
    // Left view 5% nearer (larger in the frame): its own scale compensates.
    const near = makeSilhouetteCapture('left', { pxPerCm: (600 / BODY.statureCm) * 1.05, floorY: 680 });
    const captures = { ...makeSilhouetteCaptures(), left: near, right: near };
    const chest = byId(full(captures).measurements, 'chest');
    expect(chest.source.angles).toEqual(expect.arrayContaining(['left']));
    expect(chest.value).toBeCloseTo(girth(BODY.front.chest, BODY.side.chest), 0);
  });

  it('leaves out a view whose outline height disagrees with the others, and says so', () => {
    const right = makeSilhouetteCapture('right');
    // A misplaced head point: this view's outline starts 15% lower than in the others.
    const broken = { ...right, silhouette: { ...right.silhouette!, headTopY: right.silhouette!.headTopY! + 90 } };
    const chest = byId(full({ ...makeSilhouetteCaptures(), right: broken }).measurements, 'chest');
    expect(chest.source.angles).not.toContain('right');
    expect(chest.value).toBeCloseTo(girth(BODY.front.chest, BODY.side.chest), 0);
    expect(chest.reason).toMatch(/right outline’s height did not match/);
  });

  it('never says "shown as uncertain" for a measurement that has no value', () => {
    const invalid = byId(full(makeSilhouetteCaptures(['front', 'back'])).measurements, 'waist');
    expect(invalid.status).toBe('invalid');
    expect(invalid.reason).not.toMatch(/shown as uncertain/);
  });

  it('is deterministic', () => {
    expect(full()).toEqual(full());
  });

  it('is invalid without any outline, never a guessed value', () => {
    const report = measureScan({ captures: { front: makeCapture('front'), left: makeCapture('left') }, region: 'full', userHeightCm: 175 });
    for (const id of ['chest', 'waist', 'hip', 'thigh', 'inseam'] as const) {
      expect(byId(report.measurements, id)).toMatchObject({ status: 'invalid', value: null, confidence: 0 });
    }
    expect(byId(report.measurements, 'chest').reason).toMatch(/no usable body outline/);
  });

  it('is invalid without the entered height', () => {
    const chest = byId(full(undefined, null).measurements, 'chest');
    expect(chest).toMatchObject({ status: 'invalid', value: null });
    expect(chest.reason).toMatch(/height is needed/);
  });

  it('needs a side view for girths, but not for inseam', () => {
    const report = full(makeSilhouetteCaptures(['front', 'back']));
    expect(byId(report.measurements, 'waist')).toMatchObject({ status: 'invalid', value: null });
    expect(byId(report.measurements, 'waist').reason).toMatch(/side-view/);
    expect(byId(report.measurements, 'inseam').status).toBe('uncertain');
  });

  it('gives no chest when the arms touch the body, and no thigh or inseam with the legs together', () => {
    const arms = full(makeSilhouetteCaptures(undefined, { armsTouching: true }));
    expect(byId(arms.measurements, 'chest')).toMatchObject({ status: 'invalid', value: null });
    expect(byId(arms.measurements, 'chest').reason).toMatch(/arms or hands were touching/);
    const legs = full(makeSilhouetteCaptures(undefined, { legsTogether: true }));
    expect(byId(legs.measurements, 'thigh').status).toBe('invalid');
    expect(byId(legs.measurements, 'inseam').status).toBe('invalid');
    expect(byId(legs.measurements, 'inseam').reason).toMatch(/gap between your legs/);
  });

  it('is less confident with fewer views, blurry edges, unsteady frames or disagreeing views', () => {
    const base = byId(full().measurements, 'hip').confidence;
    const fewer = byId(full(makeSilhouetteCaptures(['front', 'left'])).measurements, 'hip');
    expect(fewer.confidence).toBeLessThan(base);
    expect(fewer.reason).toMatch(/could not be cross-checked/);
    const blurry = byId(full(makeSilhouetteCaptures(undefined, { softPx: 12 })).measurements, 'hip');
    expect(blurry.confidence).toBeLessThan(base);
    const shaky = Object.fromEntries(
      (['front', 'left', 'back', 'right'] as const).map((phase) => [
        phase,
        makeSilhouetteCapture(phase, {}, [{ torsoScale: 0.96 }, {}, { torsoScale: 1.04 }]),
      ]),
    );
    expect(byId(full(shaky).measurements, 'hip').confidence).toBeLessThan(base);
    const disagree = { ...makeSilhouetteCaptures(), back: makeSilhouetteCapture('back', { torsoScale: 1.3 }) };
    expect(byId(full(disagree).measurements, 'hip').confidence).toBeLessThan(base);
  });

  it('only measures what the garment needs', () => {
    const captures = makeSilhouetteCaptures();
    const upper = measureScan({ captures, region: 'upper', userHeightCm: 175 }).measurements.map((m) => m.id);
    const lower = measureScan({ captures, region: 'lower', userHeightCm: 175 }).measurements.map((m) => m.id);
    expect(upper).toEqual(['shoulder-width', 'arm-length', 'torso-length', 'chest', 'waist']);
    expect(lower).toEqual(['waist', 'hip', 'thigh', 'leg-length', 'inseam']);
  });
});
