import { describe, expect, it } from 'vitest';
import type { FitPreference } from '../../types/domain';
import type { MeasurementId } from '../../types/measurement';
import type { SizingMeasurementInput } from '../../types/sizing';
import { fitPreferenceFor } from './fromConfirmed';
import { recommendSize } from './recommendSize';

// Hand-chosen test values against the generic charts (T-shirt chest: S 86–94 · M 94–102 · L 102–110 · XXL 118–126).
const m = (id: MeasurementId, value: number | null): SizingMeasurementInput => ({ id, value, unit: 'cm', status: value === null ? 'invalid' : 'valid' });
const tee = (chest: number | null, fitPreference?: FitPreference) => recommendSize({ garment: 't-shirt', measurements: [m('chest', chest)], fitPreference });

describe('fit preference in the size recommendation', () => {
  it('defaults to Regular, which is exactly the existing behaviour', () => {
    for (const chest of [87, 94.5, 98, 101, 101.5, 125, 127]) {
      const byDefault = tee(chest);
      expect(byDefault.fitPreference).toBe('regular');
      expect(byDefault.preferenceAdjustment).toBeNull();
      expect(tee(chest, 'regular')).toEqual(byDefault);
    }
    expect(tee(101)).toMatchObject({ size: 'M', fit: 'slightly-tight', alternativeSize: 'L' });
  });

  it('Relaxed takes the larger size when the measurement is near the top of its size', () => {
    const r = tee(101, 'relaxed'); // top band of M (≥ 100.4)
    expect(r).toMatchObject({ status: 'recommended', size: 'L', fit: 'slightly-loose', alternativeSize: 'M', preferenceAdjustment: { from: 'M', to: 'L' } });
    expect(r.reason).toMatch(/Relaxed Fit preference L is recommended/);
  });

  it('Relaxed keeps the size when the measurement sits comfortably inside it', () => {
    const r = tee(98, 'relaxed');
    expect(r).toMatchObject({ size: 'M', preferenceAdjustment: null });
    expect(r.reason).toMatch(/Relaxed Fit preference keeps M/);
  });

  it('Slim takes the smaller size only when the measurement is just above it', () => {
    const r = tee(94.5, 'slim'); // 0.5 cm above S
    expect(r).toMatchObject({ size: 'S', fit: 'slightly-tight', alternativeSize: 'M', preferenceAdjustment: { from: 'M', to: 'S' } });
    expect(r.reason).toMatch(/Slim Fit preference S is recommended/);
  });

  it('Slim never picks a size the measurements clearly do not fit', () => {
    expect(tee(95.5, 'slim')).toMatchObject({ size: 'M', preferenceAdjustment: null }); // 1.5 cm above S: too big for S
    expect(tee(98, 'slim')).toMatchObject({ size: 'M', preferenceAdjustment: null });
    expect(tee(98, 'slim').reason).toMatch(/not close enough to the smaller size/);
    // The other measurement still needs the larger size: shirt chest at the bottom of M, waist in M.
    const shirt = recommendSize({ garment: 'shirt', measurements: [m('chest', 94.5), m('waist', 85)], fitPreference: 'slim' });
    expect(shirt).toMatchObject({ size: 'M', preferenceAdjustment: null });
    // Smallest size: nothing smaller to choose.
    expect(tee(86.5, 'slim')).toMatchObject({ size: 'S', preferenceAdjustment: null });
  });

  it('Slim respects the deciding measurement when the secondary one decides', () => {
    // Jeans: waist just above M (L 88–96), hip in M → slim may take M; with hip in L it may not.
    expect(recommendSize({ garment: 'jeans', measurements: [m('waist', 88.5), m('hip', 100)], fitPreference: 'slim' })).toMatchObject({ size: 'M' });
    expect(recommendSize({ garment: 'jeans', measurements: [m('waist', 88.5), m('hip', 106)], fitPreference: 'slim' })).toMatchObject({ size: 'L', preferenceAdjustment: null });
  });

  it('Relaxed never goes beyond the chart', () => {
    expect(tee(125, 'relaxed')).toMatchObject({ size: 'XXL', preferenceAdjustment: null }); // top of XXL
    expect(tee(127, 'relaxed')).toMatchObject({ size: 'XXL', fit: 'slightly-tight', preferenceAdjustment: null }); // above the chart
    expect(tee(85, 'slim')).toMatchObject({ size: 'S', preferenceAdjustment: null }); // below the chart
  });

  it('keeps Insufficient Data and No Suitable Size for every preference', () => {
    for (const fitPreference of ['slim', 'regular', 'relaxed'] as const) {
      expect(tee(null, fitPreference)).toMatchObject({ status: 'insufficient-data', size: null, fit: 'insufficient-data', fitPreference });
      expect(tee(135, fitPreference)).toMatchObject({ status: 'outside-range', size: null, fit: 'no-size' });
      expect(tee(70, fitPreference)).toMatchObject({ status: 'outside-range', size: null });
    }
  });

  it('is deterministic', () => {
    expect(tee(101, 'relaxed')).toEqual(tee(101, 'relaxed'));
  });

  it('uses the chosen preference only when it applies to the garment', () => {
    expect(fitPreferenceFor('t-shirt', { type: 't-shirt', fit: 'relaxed' })).toBe('relaxed');
    expect(fitPreferenceFor('trousers', { type: 'trousers', fit: 'relaxed' })).toBe('regular'); // not offered for trousers
    expect(fitPreferenceFor('jeans', { type: 't-shirt', fit: 'slim' })).toBe('regular'); // chosen for another garment
    expect(fitPreferenceFor('t-shirt', null)).toBe('regular');
  });
});
