import { describe, expect, it } from 'vitest';
import { measureAnnyBody } from './measure';
import { evaluateShape, joint } from './model';
import { convexHullPerimeter, sliceCircumference, slicePoints, viewDirection, widthProfile } from './slice';
import { testModel } from './testModel';

describe('convexHullPerimeter', () => {
  it('measures a square and a circle, ignoring interior points', () => {
    expect(convexHullPerimeter([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])).toBeCloseTo(4, 10);
    const circle = Array.from({ length: 720 }, (_, i): [number, number] => [Math.cos((i * Math.PI) / 360), Math.sin((i * Math.PI) / 360)]);
    expect(convexHullPerimeter(circle)).toBeCloseTo(2 * Math.PI, 3);
    expect(convexHullPerimeter([[0, 0], [1, 1]])).toBe(0);
  });

  it('bridges concavities like a tape', () => {
    // An L-shape: the hull is shorter than the outline.
    const l: [number, number][] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    // Hull: (0,0)→(2,0)→(2,1)→(1,2)→(0,2)→(0,0) = 2 + 1 + √2 + 1 + 2.
    expect(convexHullPerimeter(l)).toBeCloseTo(6 + Math.SQRT2, 10);
    expect(convexHullPerimeter(l)).toBeLessThan(8);
  });
});

describe('mesh slicing', () => {
  const model = testModel();
  const shape = evaluateShape(model, []);

  it('slices the torso into a closed ring of points with a plausible circumference', () => {
    const z = (joint(model, shape, 'hipL')[2] + joint(model, shape, 'shoulderL')[2]) / 2;
    expect(slicePoints(model, shape, z, 'torso').length).toBeGreaterThan(20);
    const circumference = sliceCircumference(model, shape, z, 'torso');
    expect(circumference).toBeGreaterThan(0.6);
    expect(circumference).toBeLessThan(1.2);
  });

  it('separates the legs below the crotch and gives nothing above the head', () => {
    const z = joint(model, shape, 'kneeL')[2] + 0.15;
    const left = slicePoints(model, shape, z, 'leftLeg');
    const right = slicePoints(model, shape, z, 'rightLeg');
    expect(Math.min(...left.map((p) => p[0]))).toBeGreaterThan(Math.max(...right.map((p) => p[0])));
    expect(sliceCircumference(model, shape, 5, 'torso')).toBe(0);
  });

  it('gives front widths wider than side depths at the torso', () => {
    const profile = widthProfile(model, shape, [0, 90], [0.5, 0.6, 0.7]);
    for (let r = 0; r < 3; r += 1) expect(profile.views[0].widths[r]).toBeGreaterThan(profile.views[1].widths[r]);
    expect(viewDirection(90)[0]).toBeCloseTo(0, 10);
  });

  it('measures the mean body within adult ranges, every definition flagged for validation', () => {
    const measurements = measureAnnyBody(model, shape);
    expect(measurements.map((m) => m.id)).toEqual(['chest', 'waist', 'hip', 'thigh', 'inseam', 'shoulder-width', 'arm-length', 'leg-length']);
    const v = Object.fromEntries(measurements.map((m) => [m.id, m.valueCm!]));
    expect(v.chest).toBeGreaterThan(70);
    expect(v.chest).toBeLessThan(130);
    expect(v.waist).toBeLessThan(v.hip);
    expect(v.inseam).toBeGreaterThan(60);
    expect(measurements.every((m) => m.needsValidation)).toBe(true);
  });
});
