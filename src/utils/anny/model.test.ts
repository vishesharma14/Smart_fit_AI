import { describe, expect, it } from 'vitest';
import { evaluateShape, joint, verticalExtent } from './model';
import { testModel } from './testModel';

describe('Anny shape evaluation', () => {
  const model = testModel();

  it('gives the mean body for zero coefficients', () => {
    expect(evaluateShape(model, [])).toEqual(model.mean);
  });

  it('is linear in the coefficients', () => {
    const a = evaluateShape(model, [1]);
    const b = evaluateShape(model, [2]);
    const i = 3 * 4000 + 2;
    expect(b[i] - model.mean[i]).toBeCloseTo(2 * (a[i] - model.mean[i]), 4);
  });

  it('produces a plausible upright adult with joints in anatomical order', () => {
    const shape = evaluateShape(model, []);
    const { min, max } = verticalExtent(model, shape);
    expect(max - min).toBeGreaterThan(1.5);
    expect(max - min).toBeLessThan(2.0);
    expect(joint(model, shape, 'shoulderL')[2]).toBeGreaterThan(joint(model, shape, 'hipL')[2]);
    expect(joint(model, shape, 'hipL')[2]).toBeGreaterThan(joint(model, shape, 'kneeL')[2]);
    expect(joint(model, shape, 'kneeL')[2]).toBeGreaterThan(joint(model, shape, 'ankleL')[2]);
    // Left and right mirror each other across x = 0.
    expect(joint(model, shape, 'shoulderL')[0]).toBeCloseTo(-joint(model, shape, 'shoulderR')[0], 2);
  });
});
