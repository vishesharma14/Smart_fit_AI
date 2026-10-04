import { describe, expect, it } from 'vitest';
import type { Measurement, MeasurementId } from '../../types/measurement';
import type { ScanViewId } from '../../types/scan';
import { BODY } from '../silhouette/testBody';
import { measureScan } from './measureScan';
import { ellipsePerimeter } from './silhouetteMeasure';
import { makeSilhouetteCapture } from './testFixtures';

const byId = (measurements: Measurement[], id: MeasurementId) => measurements.find((m) => m.id === id)!;
const ALL: ScanViewId[] = ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'];
const CARDINALS: ScanViewId[] = ['front', 'left', 'back', 'right'];
const views = (ids: ScanViewId[], angledScale = 1) =>
  Object.fromEntries(ids.map((id) => [id, makeSilhouetteCapture(id, id.includes('-') ? { angledScale } : {})]));
const measure = (captures: ReturnType<typeof views>, userHeightCm: number | null = BODY.statureCm) =>
  measureScan({ captures, region: 'full', userHeightCm });

describe('360° views in the measurement engine', () => {
  it('keeps the same girth values with angled views (they check, they do not change the formula)', () => {
    const four = measure(views(CARDINALS));
    const eight = measure(views(ALL));
    for (const id of ['chest', 'waist', 'hip', 'thigh', 'inseam'] as const) {
      expect(byId(eight.measurements, id).value).toBe(byId(four.measurements, id).value);
    }
    expect(byId(eight.measurements, 'chest').value).toBeCloseTo(ellipsePerimeter(BODY.front.chest / 2, BODY.side.chest / 2), 0);
  });

  it('raises confidence only when angled views confirm the cross-section', () => {
    const four = byId(measure(views(CARDINALS)).measurements, 'waist').confidence;
    const confirmed = byId(measure(views(ALL)).measurements, 'waist').confidence;
    const contradicted = byId(measure(views(ALL, 1.3)).measurements, 'waist');
    expect(confirmed).toBeGreaterThan(four);
    expect(contradicted.confidence).toBeLessThan(four);
    expect(contradicted.reason).toMatch(/angled views did not match/);
  });

  it('never uses angled views as side depth', () => {
    const angledOnly = measure(views(['front', 'front-left', 'back', 'back-right']));
    expect(byId(angledOnly.measurements, 'chest')).toMatchObject({ status: 'invalid', value: null });
    expect(byId(angledOnly.measurements, 'chest').reason).toMatch(/side-view/);
  });

  it('keeps every outline measurement capped at uncertain', () => {
    for (const m of measure(views(ALL)).measurements.filter((x) => x.source.method === 'silhouette-geometry')) {
      expect(m.status).toBe('uncertain');
    }
  });

  it('gives no values at all without data (no captures)', () => {
    const report = measure({});
    expect(report.measurements.every((m) => m.value === null && m.status === 'invalid')).toBe(true);
    expect(report.anglesUsed).toEqual([]);
  });

  it('gives no outline values without the entered height', () => {
    const report = measure(views(ALL), null);
    for (const m of report.measurements.filter((x) => x.source.method === 'silhouette-geometry')) {
      expect(m).toMatchObject({ status: 'invalid', value: null });
    }
  });
});
