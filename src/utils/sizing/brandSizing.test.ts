import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClothingType, FitPreference } from '../../types/domain';
import type { MeasurementId } from '../../types/measurement';
import { SIZE_LABELS, type SizingBrandId, type SizingMeasurementInput } from '../../types/sizing';
import { BRAND_SIZE_CHARTS, REFERENCE_CHART_DISCLAIMER, SIZING_BRAND_OPTIONS } from './brandCharts';
import { recommendBrandSize } from './recommendBrandSize';
import { recommendSize } from './recommendSize';

// Hand-chosen test values against the reference charts (T-shirt chest: generic M 94–102 · Nike S 88–96, M 96–104 ·
// Levi's S 89–97 · H&M M 92–100).
const m = (id: MeasurementId, value: number | null): SizingMeasurementInput => ({ id, value, unit: 'cm', status: value === null ? 'invalid' : 'valid' });
const tee = (brand: SizingBrandId, chest: number | null, fitPreference?: FitPreference) =>
  recommendBrandSize({ brand, garment: 't-shirt', measurements: [m('chest', chest)], fitPreference });
const GARMENTS: ClothingType[] = ['t-shirt', 'shirt', 'blazer', 'jeans', 'trousers'];
const ALL = [m('chest', 100), m('waist', 84), m('hip', 100)];

afterEach(() => vi.restoreAllMocks());

describe('reference brand charts', () => {
  it('offers Generic first, then Nike, Levi\'s and H&M', () => {
    expect(SIZING_BRAND_OPTIONS.map((o) => o.name)).toEqual(['Generic', 'Nike', "Levi's", 'H&M']);
  });

  it('every brand chart has contiguous S–XXL ranges and carries the reference disclaimer', () => {
    for (const brand of BRAND_SIZE_CHARTS) {
      expect(brand.sourceNote).toContain(REFERENCE_CHART_DISCLAIMER);
      for (const chart of Object.values(brand.charts)) {
        expect(chart.name).toContain(`${brand.brandName} reference`);
        for (const cm of [chart.primary, ...(chart.secondary ? [chart.secondary] : [])]) {
          expect(cm.ranges.map((r) => r.size)).toEqual([...SIZE_LABELS]);
          cm.ranges.slice(1).forEach((r, i) => expect(r.minCm).toBe(cm.ranges[i].maxCm));
        }
      }
    }
  });
});

describe('recommendBrandSize', () => {
  it('Generic is exactly the Step 10 engine', () => {
    for (const garment of GARMENTS) {
      for (const fitPreference of ['slim', 'regular', 'relaxed'] as const) {
        const { brand, brandName, chartAvailable, ...rest } = recommendBrandSize({ brand: 'generic', garment, measurements: ALL, fitPreference });
        expect({ brand, brandName, chartAvailable }).toEqual({ brand: 'generic', brandName: 'Generic', chartAvailable: true });
        expect(rest).toEqual(recommendSize({ garment, measurements: ALL, fitPreference }));
      }
    }
  });

  it('applies each brand\'s own chart', () => {
    expect(tee('generic', 95).size).toBe('M');
    expect(tee('nike', 95)).toMatchObject({ status: 'recommended', size: 'S', brandName: 'Nike' });
    expect(tee('levis', 95)).toMatchObject({ status: 'recommended', size: 'S', brandName: "Levi's" });
    expect(tee('hm', 95)).toMatchObject({ status: 'recommended', size: 'M', brandName: 'H&M' });
    expect(tee('nike', 95).chartName).toBe('Nike reference T-shirt chart (chest)');
    expect(recommendBrandSize({ brand: 'levis', garment: 'jeans', measurements: [m('waist', 85), m('hip', 99)] })).toMatchObject({
      size: 'M',
      measurementsUsed: [expect.objectContaining({ id: 'waist', sizeForMeasurement: 'M' }), expect.objectContaining({ id: 'hip', sizeForMeasurement: 'M' })],
    });
  });

  it('is deterministic and uses no random data', () => {
    const random = vi.spyOn(Math, 'random');
    for (const brand of ['nike', 'levis', 'hm'] as const) {
      expect(tee(brand, 99.3)).toEqual(tee(brand, 99.3));
    }
    expect(random).not.toHaveBeenCalled();
  });

  it('different measurements give different sizes', () => {
    for (const brand of ['nike', 'levis', 'hm'] as const) {
      expect(tee(brand, 90).size).not.toBe(tee(brand, 110).size);
    }
    expect(tee('hm', 90).size).toBe('S');
    expect(tee('hm', 110).size).toBe('XL');
  });

  it('missing or invalid measurements give insufficient data, never a size', () => {
    for (const brand of ['nike', 'levis', 'hm'] as const) {
      expect(tee(brand, null)).toMatchObject({ status: 'insufficient-data', size: null, chartAvailable: true });
      expect(recommendBrandSize({ brand, garment: 't-shirt', measurements: [] })).toMatchObject({ status: 'insufficient-data', size: null });
      expect(tee(brand, 500)).toMatchObject({ status: 'insufficient-data', size: null });
    }
  });

  it('a brand without a chart for the garment is "Reference chart unavailable"', () => {
    const unavailable: [SizingBrandId, ClothingType][] = [['nike', 'shirt'], ['nike', 'blazer'], ['nike', 'jeans'], ['levis', 'blazer']];
    for (const [brand, garment] of unavailable) {
      const r = recommendBrandSize({ brand, garment, measurements: ALL, fitPreference: 'relaxed' });
      expect(r).toMatchObject({ status: 'unsupported', size: null, alternativeSize: null, measurementsUsed: [], chartName: null, chartAvailable: false });
      expect(r.reason).toMatch(/^Reference chart unavailable/);
    }
    expect(recommendBrandSize({ brand: 'hm', garment: null, measurements: ALL })).toMatchObject({ status: 'unsupported', size: null, chartAvailable: false });
    for (const garment of GARMENTS) expect(recommendBrandSize({ brand: 'hm', garment, measurements: ALL }).chartAvailable).toBe(true);
  });

  it('children\'s sizes stay unsupported for brands too', () => {
    expect(recommendBrandSize({ brand: 'nike', garment: 't-shirt', measurements: [m('chest', 98)], audience: 'children' })).toMatchObject({ status: 'unsupported', size: null });
  });

  it('applies the existing fit-preference rules to the brand chart, only where they allow it', () => {
    // Nike T-shirt: S 88–96 · M 96–104 (top band ≥ 102.4).
    expect(tee('nike', 96.5, 'slim')).toMatchObject({ size: 'S', preferenceAdjustment: { from: 'M', to: 'S' } });
    expect(tee('nike', 98, 'slim')).toMatchObject({ size: 'M', preferenceAdjustment: null });
    expect(tee('nike', 103, 'relaxed')).toMatchObject({ size: 'L', preferenceAdjustment: { from: 'M', to: 'L' } });
    expect(tee('nike', 99, 'relaxed')).toMatchObject({ size: 'M', preferenceAdjustment: null });
    expect(tee('nike', 99, 'regular')).toMatchObject({ size: 'M', preferenceAdjustment: null });
    // Same input on the generic chart (M 94–102) behaves differently because the chart differs, not the rule.
    expect(tee('generic', 96.5, 'slim')).toMatchObject({ size: 'M', preferenceAdjustment: null });
    // Preference never creates a size where there is none.
    expect(tee('nike', null, 'relaxed')).toMatchObject({ status: 'insufficient-data', size: null });
  });
});
