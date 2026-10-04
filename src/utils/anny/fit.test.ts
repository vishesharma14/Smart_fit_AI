import { describe, expect, it } from 'vitest';
import { fitAnny, solveLinear } from './fit';
import { measureAnnyBody } from './measure';
import { evaluateShape } from './model';
import { ANNY_FIT_FRACTIONS } from './scanInput';
import { inputFromShape, testModel } from './testModel';

const TARGETS = [
  [1.2, -0.8, 0.5, 0, 0.6, -0.4],
  [-1.0, 0.9, -0.6, 0.7, 0, 0.3, -0.5],
  [0.4, 1.3, 0.8, -0.9, 0.2],
];

describe('solveLinear', () => {
  it('solves a small system', () => {
    const x = solveLinear(new Float64Array([2, 1, 1, 3]), new Float64Array([3, 5]), 2);
    expect(x[0]).toBeCloseTo(0.8, 10);
    expect(x[1]).toBeCloseTo(1.4, 10);
  });
});

describe('fitAnny', () => {
  const model = testModel();

  it('converges and matches the outlines and height of known bodies', () => {
    for (const target of TARGETS) {
      const fit = fitAnny(model, inputFromShape(model, target, [0, 90, 180], 0.01));
      expect(fit.converged).toBe(true);
      expect(fit.iterations).toBeLessThanOrEqual(20);
      expect(fit.rmsResidual).toBeLessThan(0.015);
      expect(Math.abs(fit.heightError)).toBeLessThan(0.005);
    }
  });

  it('recovers girths of known bodies to within a few centimetres (synthetic, same model family)', () => {
    let worst = 0;
    for (const target of TARGETS) {
      const truth = Object.fromEntries(measureAnnyBody(model, evaluateShape(model, target)).map((m) => [m.id, m.valueCm!]));
      const fitted = Object.fromEntries(measureAnnyBody(model, fitAnny(model, inputFromShape(model, target)).shape).map((m) => [m.id, m.valueCm!]));
      for (const id of ['chest', 'waist', 'hip']) worst = Math.max(worst, Math.abs(fitted[id] - truth[id]));
    }
    expect(worst).toBeLessThan(6);
  });

  it('does nothing useful without rows (no observations)', () => {
    const fit = fitAnny(model, { heightM: 1.75, fractions: ANNY_FIT_FRACTIONS, views: [{ yawDeg: 0, widths: ANNY_FIT_FRACTIONS.map(() => null) }] });
    expect(fit.rowsUsed).toBe(0);
    expect(fit.converged).toBe(false);
  });
});
