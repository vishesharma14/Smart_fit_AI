import { describe, expect, it } from 'vitest';
import type { ScanCapture, ScanViewId } from '../../types/scan';
import { measureScan } from '../measurement/measureScan';
import { makeSilhouetteCapture, makeSilhouetteCaptures } from '../measurement/testFixtures';
import { BODY } from '../silhouette/testBody';
import { SCAN_VIEWS } from '../scan360/views';
import { calculateScanQuality, INCOMPLETE_SCAN_MAX_SCORE, levelFor } from './scanQuality';

// Synthetic captures of the rendered test body (tests only), run through the real outline pipeline.
const ALL: ScanViewId[] = SCAN_VIEWS.map((v) => v.id);
const H = BODY.statureCm;
const quality = (captures: Partial<Record<ScanViewId, ScanCapture>>, userHeightCm: number | null = H) =>
  calculateScanQuality({ captures, report: measureScan({ captures, region: 'full', userHeightCm }), userHeightCm });
const factor = (q: ReturnType<typeof calculateScanQuality>, id: string) => q.factors.find((f) => f.id === id)!.score;

describe('calculateScanQuality', () => {
  const full = makeSilhouetteCaptures(ALL);

  it('gives a complete, clear scan a deterministic high score', () => {
    const q = quality(full);
    expect(q.score).toBeGreaterThanOrEqual(90);
    expect(q.level).toBe('excellent');
    expect(q.recommendations).toEqual([]);
    expect(q.cappedBecause).toBeNull();
    expect(factor(q, 'coverage')).toBe(100);
  });

  it('is exactly the same for the same input', () => {
    expect(quality(full)).toEqual(quality(full));
  });

  it('poor framing (low joint visibility / clipped outline) lowers the score', () => {
    const lowVis = Object.fromEntries(
      Object.entries(full).map(([k, c]) => [k, { ...c!, landmarks: c!.landmarks.map((l) => ({ ...l, visibility: 0.3 })) }]),
    );
    const q = quality(lowVis);
    expect(factor(q, 'visibility')).toBe(30);
    expect(q.score).toBeLessThan(quality(full).score);
    expect(q.recommendations).toContain('Keep your full body inside the frame, from head to feet.');
    const clipped = { ...full, front: { ...full.front!, silhouette: { ...full.front!.silhouette!, floorClipped: true } } };
    expect(factor(quality(clipped), 'visibility')!).toBeLessThan(factor(quality(full), 'visibility')!);
  });

  it('poor pose stability (outline jitter over the hold) lowers the score', () => {
    // Real jitter from the outline pipeline (front view, torso width varying ±15 % between hold frames)…
    const front = makeSilhouetteCapture('front', {}, [{ torsoScale: 0.85 }, { torsoScale: 1.15 }, { torsoScale: 0.85 }, { torsoScale: 1.15 }]);
    expect(front.silhouette!.widthJitter!).toBeGreaterThan(0.08);
    // …applied to every view (the synthetic body only varies on the rows the front view measures).
    const shaky = Object.fromEntries(
      Object.entries(full).map(([k, c]) => [k, { ...c!, silhouette: { ...c!.silhouette!, widthJitter: 0.06 } }]),
    );
    const q = quality(shaky);
    expect(factor(q, 'stability')).toBe(25); // 1 − 0.06 / 0.08
    expect(factor(q, 'stability')!).toBeLessThan(75);
    expect(q.score).toBeLessThan(quality(full).score);
    expect(q.recommendations).toContain('Stand still while each view is captured.');
  });

  it('incomplete view coverage lowers the score and caps it at Fair', () => {
    const cardinalsOnly = quality(makeSilhouetteCaptures(['front', 'left', 'back', 'right']));
    expect(factor(cardinalsOnly, 'coverage')).toBe(80);
    const twoViews = quality(makeSilhouetteCaptures(['front', 'left']));
    expect(factor(twoViews, 'coverage')).toBe(40);
    expect(twoViews.score).toBeLessThanOrEqual(INCOMPLETE_SCAN_MAX_SCORE);
    expect(['fair', 'poor']).toContain(twoViews.level);
    expect(twoViews.cappedBecause).toMatch(/main views/);
    expect(twoViews.recommendations).toContain('Complete the full rotation before continuing.');
  });

  it('poor outline quality (blurred edges / missing outlines) lowers the score', () => {
    const blurred = quality(Object.fromEntries(ALL.map((v) => [v, makeSilhouetteCapture(v, { softPx: 14 })])));
    expect(factor(blurred, 'outline')!).toBeLessThan(factor(quality(full), 'outline')!);
    const noOutlines = Object.fromEntries(Object.entries(full).map(([k, c]) => [k, { ...c!, silhouette: undefined }]));
    const q = quality(noOutlines);
    expect(factor(q, 'outline')).toBe(0);
    expect(factor(q, 'stability')).toBeNull(); // no outline → no jitter signal → left out, not invented
    expect(q.recommendations).toContain('Use clearer, even lighting and avoid loose clothing.');
    expect(q.recommendations).not.toContain('Stand still while each view is captured.');
  });

  it('missing optional signals never produce NaN or Infinity', () => {
    const cases = [
      calculateScanQuality({ captures: {} }),
      calculateScanQuality({ captures: full }), // no report, no height
      quality(full, null),
      calculateScanQuality({ captures: { front: { ...full.front!, landmarks: [] } } }),
    ];
    for (const q of cases) {
      expect(Number.isFinite(q.score)).toBe(true);
      for (const f of q.factors) expect(f.score === null || Number.isFinite(f.score)).toBe(true);
    }
    expect(cases[0]).toMatchObject({ score: 0, level: 'poor' });
  });

  it('scanning without an entered height lowers scale calibration', () => {
    const q = quality(full, null);
    expect(factor(q, 'calibration')!).toBeLessThan(factor(quality(full), 'calibration')!);
    expect(q.recommendations).toContain('Enter your height before scanning so your views can be scaled to centimetres.');
  });

  it('clamps the score to 0–100', () => {
    const extreme = Object.fromEntries(
      Object.entries(full).map(([k, c]) => [k, { ...c!, landmarks: c!.landmarks.map((l) => ({ ...l, visibility: 7 })) }]),
    );
    const q = quality(extreme);
    expect(q.score).toBeLessThanOrEqual(100);
    expect(factor(q, 'visibility')).toBe(100);
  });

  it('maps scores to levels deterministically', () => {
    expect([100, 90, 89, 75, 74, 60, 59, 0].map(levelFor)).toEqual(['excellent', 'excellent', 'good', 'good', 'fair', 'fair', 'poor', 'poor']);
  });

  it('recommends only for weak factors that were actually measured', () => {
    const q = quality(full);
    expect(q.recommendations).toEqual([]);
    const noReport = calculateScanQuality({ captures: { ...full, front: { ...full.front!, landmarks: full.front!.landmarks.map((l) => ({ ...l, visibility: 0 })) } } });
    // Visibility drops a little (1 of 8 views) — not weak overall, so no framing advice.
    expect(factor(noReport, 'visibility')!).toBeGreaterThan(75);
    expect(noReport.recommendations).not.toContain('Keep your full body inside the frame, from head to feet.');
  });
});
