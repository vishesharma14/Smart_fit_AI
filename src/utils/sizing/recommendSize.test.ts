import { describe, expect, it } from 'vitest';
import type { ClothingType } from '../../types/domain';
import type { ConfirmedMeasurements, MeasurementId, MeasurementStatus } from '../../types/measurement';
import { SIZE_LABELS, type SizingMeasurementInput } from '../../types/sizing';
import { recommendForConfirmed } from './fromConfirmed';
import { locate, recommendSize } from './recommendSize';
import { SIZE_CHARTS } from './sizeCharts';

// Hand-chosen test values (tests only): each case states which chart range it targets.
const m = (id: MeasurementId, value: number | null, status: MeasurementStatus = 'valid', extra: Partial<SizingMeasurementInput> = {}): SizingMeasurementInput => ({
  id,
  value,
  unit: 'cm',
  status,
  ...extra,
});
const body = (chest: number | null, waist: number | null, hip: number | null, status: MeasurementStatus = 'valid') => [
  m('chest', chest, chest === null ? 'invalid' : status),
  m('waist', waist, waist === null ? 'invalid' : status),
  m('hip', hip, hip === null ? 'invalid' : status),
];
const GARMENTS: ClothingType[] = ['t-shirt', 'shirt', 'blazer', 'jeans', 'trousers'];

describe('size charts', () => {
  it('define contiguous S–XXL ranges for every supported garment', () => {
    for (const garment of GARMENTS) {
      const chart = SIZE_CHARTS[garment];
      for (const cm of [chart.primary, chart.secondary].filter((c) => c !== null)) {
        expect(cm.ranges.map((r) => r.size)).toEqual([...SIZE_LABELS]);
        cm.ranges.forEach((r, i) => {
          expect(r.maxCm).toBeGreaterThan(r.minCm);
          if (i > 0) expect(r.minCm).toBe(cm.ranges[i - 1].maxCm);
        });
      }
    }
  });
});

describe('recommendSize', () => {
  it('gives every supported garment a recommendation from its own chart', () => {
    for (const garment of GARMENTS) {
      const r = recommendSize({ garment, measurements: body(98, 84, 100) });
      expect(r.status).toBe('recommended');
      expect(r.garment).toBe(garment);
      expect(r.chartName).toBe(SIZE_CHARTS[garment].name);
      expect(r.measurementsUsed[0].id).toBe(SIZE_CHARTS[garment].primary.id);
    }
  });

  it('different body measurements produce different sizes', () => {
    const sizes = [88, 97, 106, 114, 122].map((chest) => recommendSize({ garment: 't-shirt', measurements: body(chest, null, null) }).size);
    expect(sizes).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
  });

  it('different garments produce different recommendations for the same body', () => {
    const measurements = body(101, 85, 99);
    expect(recommendSize({ garment: 't-shirt', measurements }).size).toBe('M'); // chest 94–102
    expect(recommendSize({ garment: 'blazer', measurements }).size).toBe('L'); // chest 100–106
    expect(recommendSize({ garment: 'jeans', measurements }).size).toBe('M'); // waist 80–88, hip 96–104
    expect(recommendSize({ garment: 'trousers', measurements }).size).toBe('L'); // waist 84–91
  });

  it('handles boundary values: min inclusive, max exclusive', () => {
    expect(recommendSize({ garment: 't-shirt', measurements: body(94, null, null) }).size).toBe('M');
    expect(recommendSize({ garment: 't-shirt', measurements: body(93.9, null, null) }).size).toBe('S');
    expect(recommendSize({ garment: 't-shirt', measurements: body(126, null, null) })).toMatchObject({ size: 'XXL', fit: 'slightly-tight' });
    // Within 3 cm outside the chart: nearest size, marked tight / loose.
    expect(recommendSize({ garment: 't-shirt', measurements: body(84, null, null) })).toMatchObject({ size: 'S', fit: 'slightly-loose' });
    expect(recommendSize({ garment: 't-shirt', measurements: body(128.5, null, null) })).toMatchObject({ size: 'XXL', fit: 'slightly-tight' });
    // Further out: no size.
    expect(recommendSize({ garment: 't-shirt', measurements: body(80, null, null) })).toMatchObject({ status: 'outside-range', size: null, fit: 'no-size' });
    expect(recommendSize({ garment: 't-shirt', measurements: body(135, null, null) })).toMatchObject({ status: 'outside-range', size: null });
  });

  it('reports fit within the size range and offers the neighbouring size at a boundary', () => {
    expect(recommendSize({ garment: 't-shirt', measurements: body(98, null, null) })).toMatchObject({ size: 'M', fit: 'good-fit', alternativeSize: null });
    expect(recommendSize({ garment: 't-shirt', measurements: body(101.5, null, null) })).toMatchObject({ size: 'M', fit: 'slightly-tight', alternativeSize: 'L' });
    expect(recommendSize({ garment: 't-shirt', measurements: body(94.5, null, null) })).toMatchObject({ size: 'M', fit: 'slightly-loose', alternativeSize: 'S' });
  });

  it('sizes up when the secondary measurement needs a larger size', () => {
    const r = recommendSize({ garment: 'jeans', measurements: body(null, 84, 108) }); // waist M, hip L
    expect(r).toMatchObject({ status: 'recommended', size: 'L' });
    expect(r.measurementsUsed.map((u) => [u.id, u.sizeForMeasurement])).toEqual([
      ['waist', 'M'],
      ['hip', 'L'],
    ]);
    expect(r.reason).toMatch(/to fit both/);
    // The other way round: waist decides, hip smaller → roomier at the hip.
    const roomy = recommendSize({ garment: 'jeans', measurements: body(null, 92, 98) }); // waist L (mid), hip M
    expect(roomy).toMatchObject({ size: 'L', fit: 'slightly-loose' });
  });

  it('returns insufficient data when the required measurement is missing — never a substitute', () => {
    const noChest = recommendSize({ garment: 'shirt', measurements: body(null, 84, 100) });
    expect(noChest).toMatchObject({ status: 'insufficient-data', size: null, fit: 'insufficient-data', measurementsUsed: [] });
    expect(noChest.reason).toMatch(/chest/i);
    expect(recommendSize({ garment: 'jeans', measurements: [m('chest', 100)] })).toMatchObject({ status: 'insufficient-data', size: null });
    expect(recommendSize({ garment: 'blazer', measurements: [] }).status).toBe('insufficient-data');
    expect(recommendSize({ garment: 'jeans', measurements: [m('waist', null, 'unsupported')] }).status).toBe('insufficient-data');
  });

  it('uses only the primary measurement when the secondary one is missing, and says so', () => {
    const r = recommendSize({ garment: 'shirt', measurements: body(98, null, null) });
    expect(r).toMatchObject({ status: 'recommended', size: 'M' });
    expect(r.measurementsUsed).toHaveLength(1);
    expect(r.reason).toMatch(/based on chest only/i);
  });

  it('uses uncertain measurements but flags them', () => {
    const r = recommendSize({ garment: 't-shirt', measurements: body(98, null, null, 'uncertain') });
    expect(r).toMatchObject({ status: 'recommended', size: 'M', basedOnUncertain: true });
    expect(r.reason).toMatch(/uncertain estimate/);
    expect(recommendSize({ garment: 't-shirt', measurements: body(98, null, null) }).basedOnUncertain).toBe(false);
  });

  it('rejects invalid measurements: non-finite, implausible, wrong unit', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -95, 0, 5, 900]) {
      const r = recommendSize({ garment: 't-shirt', measurements: [m('chest', bad)] });
      expect(r).toMatchObject({ status: 'insufficient-data', size: null });
      expect(r.reason).toMatch(/not a plausible body measurement/);
    }
    const modelUnits = recommendSize({ garment: 't-shirt', measurements: [m('chest', 98, 'uncertain', { unit: 'model-units' })] });
    expect(modelUnits).toMatchObject({ status: 'insufficient-data' });
    expect(modelUnits.reason).toMatch(/not in centimetres/);
  });

  it('keeps manually edited values and reports them as such', () => {
    const r = recommendSize({ garment: 't-shirt', measurements: [m('chest', 110.5, 'uncertain', { manuallyEdited: true })] });
    expect(r).toMatchObject({ size: 'XL' });
    expect(r.measurementsUsed[0]).toMatchObject({ valueCm: 110.5, manuallyEdited: true });
  });

  it('is unsupported without a garment or for children (adult charts only)', () => {
    expect(recommendSize({ garment: null, measurements: body(98, 84, 100) })).toMatchObject({ status: 'unsupported', size: null });
    expect(recommendSize({ garment: 't-shirt', measurements: body(98, 84, 100), audience: 'children' })).toMatchObject({ status: 'unsupported' });
  });

  it('is deterministic', () => {
    const a = recommendSize({ garment: 'blazer', measurements: body(103, 88, 100) });
    expect(recommendSize({ garment: 'blazer', measurements: body(103, 88, 100) })).toEqual(a);
  });

  it('locate maps values to range positions', () => {
    expect(locate(SIZE_CHARTS.jeans.primary, 80)).toMatchObject({ index: 1, side: 'inside', band: 'low' });
    expect(locate(SIZE_CHARTS.jeans.primary, 115.1)).toMatchObject({ index: null, side: 'above' });
  });
});

describe('recommendForConfirmed', () => {
  const confirmed = (clothingType: ClothingType | null): ConfirmedMeasurements => ({
    region: 'upper',
    clothingType,
    measurements: [
      { id: 'chest', name: 'Chest', definition: '', value: 98, unit: 'cm', confidence: 0.6, source: { method: 'silhouette', angles: [], landmarks: [] }, status: 'uncertain', measuredValue: 98, manuallyEdited: false },
    ] as unknown as ConfirmedMeasurements['measurements'],
    calibration: { method: 'user-height', confidence: 1, detail: '' } as ConfirmedMeasurements['calibration'],
    measuredAt: '2026-01-01T00:00:00.000Z',
    confirmedAt: '2026-01-01T00:01:00.000Z',
  });

  it('recommends from the confirmed measurements for the scanned garment', () => {
    expect(recommendForConfirmed(confirmed('t-shirt'), null)).toMatchObject({ status: 'recommended', size: 'M', garment: 't-shirt' });
  });
  it('falls back to the current clothing selection when the scan had no garment', () => {
    expect(recommendForConfirmed(confirmed(null), { type: 'shirt', fit: 'regular' })).toMatchObject({ garment: 'shirt', size: 'M' });
  });
  it('needs confirmed measurements', () => {
    expect(recommendForConfirmed(null, { type: 't-shirt', fit: 'regular' })).toMatchObject({ status: 'insufficient-data', size: null });
  });
});
