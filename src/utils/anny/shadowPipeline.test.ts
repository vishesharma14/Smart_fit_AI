import { describe, expect, it } from 'vitest';
import type { MeasurementReport } from '../../types/measurement';
import { measureScan } from '../measurement/measureScan';
import { makeCapture, makeSilhouetteCaptures } from '../measurement/testFixtures';
import { BODY } from '../silhouette/testBody';
import { ANNY_FIT_FRACTIONS, buildAnnyFitInput } from './scanInput';
import { compareWithEngine, runAnnyShadow, type AnnyShadowResult } from './shadow';
import { inputFromShape, testModel } from './testModel';

describe('buildAnnyFitInput (360° scan captures → fitter input)', () => {
  it('converts outline rows to metres, per view, with the measured angle', () => {
    const result = buildAnnyFitInput(makeSilhouetteCaptures(), BODY.statureCm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.viewsUsed).toEqual(['front', 'left', 'back', 'right']);
    expect(result.input.heightM).toBeCloseTo(1.75, 10);
    // Synthetic body: chest front width 32 cm, side depth 24 cm at 130 cm (fraction 0.743).
    const r = ANNY_FIT_FRACTIONS.findIndex((f) => Math.abs(f - 130 / 175) < 0.006);
    expect(result.input.views[0].widths[r]).toBeCloseTo(0.32, 2);
    expect(result.input.views[1].widths[r]).toBeCloseTo(0.24, 2);
    expect(result.input.views[1].yawDeg).toBe(90);
  });

  it('is unavailable without height, outlines, or a front/back plus a side view', () => {
    expect(buildAnnyFitInput(makeSilhouetteCaptures(), null)).toMatchObject({ ok: false, reason: expect.stringMatching(/height/) });
    expect(buildAnnyFitInput({}, 175).ok).toBe(false);
    expect(buildAnnyFitInput({ front: makeCapture('front'), left: makeCapture('left') }, 175).ok).toBe(false);
    expect(buildAnnyFitInput(makeSilhouetteCaptures(['front', 'back']), 175)).toMatchObject({ ok: false, reason: expect.stringMatching(/side/) });
    // Head cut off: the outline can't be scaled, so the view doesn't count.
    expect(buildAnnyFitInput(makeSilhouetteCaptures(['front', 'left'], { floorY: 590 }), 175).ok).toBe(false);
  });
});

describe('runAnnyShadow', () => {
  const model = testModel();

  it('returns experimental measurements, all flagged for validation, for an outline the model can explain', () => {
    const result = runAnnyShadow(model, inputFromShape(model, [0.8, -0.5, 0.3]), ['front', 'left', 'back']);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.confidence).toBe('experimental');
    expect(result.measurements).toHaveLength(8);
    expect(result.measurements.every((m) => m.needsValidation && m.valueCm !== null)).toBe(true);
    expect(result.fit.viewsUsed).toEqual(['front', 'left', 'back']);
  });

  it('is unavailable (no values) when the model cannot match the outlines', () => {
    const input = inputFromShape(model, []);
    const wrong = { ...input, views: input.views.map((v) => ({ ...v, widths: v.widths.map((w) => (w === null ? null : w * 1.6)) })) };
    const result = runAnnyShadow(model, wrong, ['front', 'left', 'back']);
    expect(result.status).toBe('unavailable');
    expect(result).not.toHaveProperty('measurements');
  });

  it('is unavailable when the fitted height cannot match the entered height', () => {
    const input = { ...inputFromShape(model, []), heightM: 2.6 };
    expect(runAnnyShadow(model, input, ['front', 'left']).status).toBe('unavailable');
  });
});

describe('compareWithEngine', () => {
  const report = measureScan({ captures: makeSilhouetteCaptures(), region: 'full', userHeightCm: BODY.statureCm });
  const shadow: AnnyShadowResult = {
    status: 'ok',
    confidence: 'experimental',
    fit: { iterations: 5, converged: true, rmsResidualCm: 0.8, heightErrorCm: 0.1, rowsUsed: 90, viewsUsed: ['front', 'left'] },
    measurements: (['chest', 'waist', 'hip', 'thigh', 'inseam', 'shoulder-width', 'arm-length', 'leg-length'] as const).map((id) => ({
      id,
      label: id,
      valueCm: 80,
      definition: '',
      needsValidation: true,
    })),
  };

  it('shows engine and Anny values side by side with the difference', () => {
    const rows = compareWithEngine(report, shadow);
    const waist = rows.find((r) => r.id === 'waist')!;
    const engineWaist = report.measurements.find((m) => m.id === 'waist')!.value!;
    expect(waist).toMatchObject({ engineCm: engineWaist, annyCm: 80, engineStatus: 'uncertain' });
    expect(waist.differenceCm).toBeCloseTo(80 - engineWaist, 5);
  });

  it('leaves the difference empty when either side has no value', () => {
    const upperOnly: MeasurementReport = measureScan({ captures: makeSilhouetteCaptures(), region: 'upper', userHeightCm: BODY.statureCm });
    expect(compareWithEngine(upperOnly, shadow).find((r) => r.id === 'inseam')).toMatchObject({ engineCm: null, differenceCm: null });
    const unavailable: AnnyShadowResult = { status: 'unavailable', reason: 'x', fit: null };
    expect(compareWithEngine(report, unavailable).every((r) => r.annyCm === null && r.differenceCm === null)).toBe(true);
    expect(compareWithEngine(null, shadow).every((r) => r.engineCm === null)).toBe(true);
  });
});
