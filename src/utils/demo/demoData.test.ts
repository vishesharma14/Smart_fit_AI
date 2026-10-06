import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import type { ClothingType } from '../../types/domain';
import { confirmMeasurements, initialReview } from '../measurement/review';
import { buildFitProfile, normalizeFitProfile, normalizeScanRecord, toScanRecord } from '../profile/fitProfile';
import { SCAN_QUALITY_WEIGHTS } from '../scanQuality/scanQuality';
import { recommendBrandSize } from '../sizing/recommendBrandSize';
import { recommendSize } from '../sizing/recommendSize';
import { buildDemoScanResult, DEMO_MEASUREMENTS_CM, DEMO_SCAN_QUALITY, DEMO_USER_INFO } from './demoData';

const NOW = new Date('2026-10-06T09:00:00.000Z');
const confirmDemo = (garment: ClothingType) => {
  const result = buildDemoScanResult(garment, NOW);
  return confirmMeasurements(result, initialReview(result, null), NOW);
};

afterEach(() => vi.restoreAllMocks());

describe('demo fixture', () => {
  it('is fixed sample data: the same every time, never random', () => {
    const random = vi.spyOn(Math, 'random');
    expect(buildDemoScanResult('jeans', NOW)).toEqual(buildDemoScanResult('jeans', NOW));
    expect(random).not.toHaveBeenCalled();
    expect(DEMO_MEASUREMENTS_CM).toEqual({
      'shoulder-width': 45, 'arm-length': 62, 'torso-length': 58, chest: 98, waist: 84, hip: 100, thigh: 57, inseam: 80, 'leg-length': 94,
    });
    expect(DEMO_USER_INFO.name).toBe('Demo User');
  });

  it('builds an ordinary scan result for the garment\'s region, marked as demo', () => {
    const tee = buildDemoScanResult('t-shirt', NOW);
    expect(tee).toMatchObject({ demo: true, clothingType: 't-shirt', measuredAt: NOW.toISOString(), report: { region: 'upper' } });
    expect(tee.report.measurements.map((m) => [m.id, m.value])).toEqual(
      tee.report.measurements.map((m) => [m.id, DEMO_MEASUREMENTS_CM[m.id]]),
    );
    expect(tee.report.measurements.find((m) => m.id === 'chest')).toMatchObject({ unit: 'cm', status: 'uncertain' });
    expect(tee.report.measurements.find((m) => m.id === 'shoulder-width')).toMatchObject({ unit: 'cm', status: 'valid' });
    expect(tee.report.calibration.detail).toMatch(/Demo Mode/);
    expect(buildDemoScanResult('jeans', NOW).report.region).toBe('lower');
    expect(buildDemoScanResult(null, NOW).report.region).toBe('full');
  });

  it('has a fixed sample scan quality in the real shape: 94 / Excellent, the weighted mean of its factors', () => {
    expect(DEMO_SCAN_QUALITY).toMatchObject({ score: 94, level: 'excellent', recommendations: [], cappedBecause: null });
    const weighted = DEMO_SCAN_QUALITY.factors.reduce((s, f) => s + f.score! * f.weight, 0) / DEMO_SCAN_QUALITY.factors.reduce((s, f) => s + f.weight, 0);
    expect(Math.round(weighted)).toBe(94);
    for (const f of DEMO_SCAN_QUALITY.factors) expect(f.weight).toBe(SCAN_QUALITY_WEIGHTS[f.id]);
    expect(buildDemoScanResult('t-shirt', NOW).scanQuality).toBe(DEMO_SCAN_QUALITY);
  });
});

describe('demo data through the existing pipeline', () => {
  it('keeps the demo marker through confirmation, profile and history', () => {
    const confirmed = confirmDemo('t-shirt');
    expect(confirmed.demo).toBe(true);
    const recommendation = recommendSize({ garment: 't-shirt', measurements: confirmed.measurements });
    const profile = buildFitProfile(confirmed, recommendation, NOW)!;
    expect(profile.demo).toBe(true);
    expect(toScanRecord(profile).demo).toBe(true);
    expect(normalizeFitProfile(JSON.parse(JSON.stringify(profile)))?.demo).toBe(true);
    expect(normalizeScanRecord(JSON.parse(JSON.stringify(toScanRecord(profile))))?.demo).toBe(true);
  });

  it('never marks real results as demo, and only accepts an exact `true` from storage', () => {
    const real = { ...confirmDemo('t-shirt') };
    delete real.demo;
    const profile = buildFitProfile(real, recommendSize({ garment: 't-shirt', measurements: real.measurements }), NOW)!;
    expect(profile).not.toHaveProperty('demo');
    expect(toScanRecord(profile)).not.toHaveProperty('demo');
    expect(normalizeFitProfile({ ...profile, demo: 'yes' })).not.toHaveProperty('demo');
    expect(normalizeScanRecord({ ...toScanRecord(profile), demo: 1 })).not.toHaveProperty('demo');
  });

  it('is sized by the existing engine, charts, brands and fit preference', () => {
    const tee = confirmDemo('t-shirt').measurements;
    // Generic T-shirt chest 94–102 = M; chest 98 sits mid-range.
    expect(recommendSize({ garment: 't-shirt', measurements: tee })).toMatchObject({ status: 'recommended', size: 'M', fit: 'good-fit', basedOnUncertain: true });
    // Same values on a reference brand chart (Nike T-shirt M 96–104) via the Step 15 path.
    expect(recommendBrandSize({ brand: 'nike', garment: 't-shirt', measurements: tee })).toMatchObject({ size: 'M', brandName: 'Nike' });
    // Jeans: waist 84 (M 80–88), hip 100 (M 96–104).
    expect(recommendSize({ garment: 'jeans', measurements: confirmDemo('jeans').measurements })).toMatchObject({ size: 'M' });
    // Nike has no blazer chart: unavailable, never invented.
    expect(recommendBrandSize({ brand: 'nike', garment: 'blazer', measurements: confirmDemo('blazer').measurements })).toMatchObject({ size: null, chartAvailable: false });
    // Missing data is handled as for a real scan.
    const noChest = tee.map((m) => (m.id === 'chest' ? { ...m, value: null, status: 'invalid' as const } : m));
    expect(recommendSize({ garment: 't-shirt', measurements: noChest })).toMatchObject({ status: 'insufficient-data', size: null });
  });
});

describe('demo mode state', () => {
  it('enters with sample details and leaves without touching saved data or real results', () => {
    useAppStore.setState({ demoMode: false, fitProfile: null, scanHistory: [], measurements: null, scanMeasurements: null });
    useAppStore.getState().enterDemoMode();
    expect(useAppStore.getState()).toMatchObject({ demoMode: true, userInfo: DEMO_USER_INFO });
    useAppStore.getState().setScanMeasurements(buildDemoScanResult('t-shirt', NOW));
    useAppStore.getState().exitDemoMode();
    expect(useAppStore.getState()).toMatchObject({ demoMode: false, scanMeasurements: null, measurements: null });
    expect(useAppStore.getState().userInfo).toEqual({ name: '', gender: null, age: null, heightCm: null, weightKg: null });
    // Exiting when not in Demo Mode changes nothing (a real result stays).
    const real = { ...buildDemoScanResult('t-shirt', NOW) };
    delete real.demo;
    useAppStore.setState({ scanMeasurements: real, userInfo: { ...DEMO_USER_INFO, name: 'Real' } });
    useAppStore.getState().exitDemoMode();
    expect(useAppStore.getState().scanMeasurements).toBe(real);
    expect(useAppStore.getState().userInfo.name).toBe('Real');
  });

  it('is never persisted', () => {
    useAppStore.getState().enterDemoMode();
    const partialize = useAppStore.persist.getOptions().partialize!;
    expect(partialize(useAppStore.getState())).not.toHaveProperty('demoMode');
    useAppStore.getState().exitDemoMode();
  });
});
