import { describe, expect, it } from 'vitest';
import type { MeasurementId } from '../../types/measurement';
import type { SavedMeasurement } from '../../types/profile';
import { classifyChange, compareMeasurements, formatChangeCm, MEANINGFUL_CHANGE_CM } from './compareMeasurements';

// Hand-written test snapshots (tests only).
const NAMES: Partial<Record<MeasurementId, string>> = { chest: 'Chest', waist: 'Waist', hip: 'Hip', 'shoulder-width': 'Shoulder width' };
const m = (id: MeasurementId, valueCm: number): SavedMeasurement => ({
  id,
  name: NAMES[id] ?? id,
  valueCm,
  status: 'uncertain',
  confidence: 0.6,
  manuallyEdited: false,
});
const row = (previous: SavedMeasurement[], latest: SavedMeasurement[], id: MeasurementId) =>
  compareMeasurements(previous, latest).rows.find((r) => r.id === id);

describe('measurement change threshold', () => {
  it('uses one named threshold of 0.5 cm', () => {
    expect(MEANINGFUL_CHANGE_CM).toBe(0.5);
    expect(classifyChange(0)).toBe('no-change');
    expect(classifyChange(0.49)).toBe('no-change');
    expect(classifyChange(-0.49)).toBe('no-change');
    expect(classifyChange(0.5)).toBe('increase');
    expect(classifyChange(-0.5)).toBe('decrease');
    expect(classifyChange(2.5)).toBe('increase');
  });

  it('treats a 0.5 cm change as 0.5 cm despite floating-point error', () => {
    expect(64.1 - 63.6).toBeLessThan(0.5); // the raw subtraction is 0.49999999999999…
    expect(row([m('chest', 63.6)], [m('chest', 64.1)], 'chest')?.change).toBe('increase');
    expect(row([m('chest', 64.1)], [m('chest', 63.6)], 'chest')?.change).toBe('decrease');
  });

  it('formats the displayed difference to one decimal with a sign', () => {
    expect(formatChangeCm(2.5)).toBe('+2.5 cm');
    expect(formatChangeCm(-1.5)).toBe('−1.5 cm');
    expect(formatChangeCm(2.46)).toBe('+2.5 cm');
    expect(formatChangeCm(3)).toBe('+3.0 cm');
  });
});

describe('compareMeasurements', () => {
  it('calculates latest − previous per measurement', () => {
    const previous = [m('chest', 98.5), m('waist', 88), m('shoulder-width', 45)];
    const latest = [m('chest', 101), m('waist', 86.5), m('shoulder-width', 45.2)];
    const { rows, comparableCount } = compareMeasurements(previous, latest);
    expect(comparableCount).toBe(3);
    expect(rows).toEqual([
      { id: 'chest', name: 'Chest', previousCm: 98.5, latestCm: 101, changeCm: 2.5, change: 'increase' },
      { id: 'waist', name: 'Waist', previousCm: 88, latestCm: 86.5, changeCm: -1.5, change: 'decrease' },
      expect.objectContaining({ id: 'shoulder-width', previousCm: 45, latestCm: 45.2, change: 'no-change' }),
    ]);
  });

  it('keeps the stored values unrounded and never changes the inputs', () => {
    const previous = [m('chest', 98.46)];
    const latest = [m('chest', 101.04)];
    const before = JSON.stringify([previous, latest]);
    const r = row(previous, latest, 'chest')!;
    expect(r.previousCm).toBe(98.46);
    expect(r.latestCm).toBe(101.04);
    expect(r.changeCm).toBeCloseTo(2.58, 10);
    expect(JSON.stringify([previous, latest])).toBe(before);
  });

  it('gives no comparison when the earlier record has no value', () => {
    expect(row([m('waist', 88)], [m('chest', 101), m('waist', 86)], 'chest')).toEqual({
      id: 'chest',
      name: 'Chest',
      previousCm: null,
      latestCm: 101,
      changeCm: null,
      change: 'unavailable',
    });
  });

  it('gives no comparison when the latest record has no value', () => {
    expect(row([m('chest', 98.5), m('waist', 88)], [m('waist', 86)], 'chest')).toEqual({
      id: 'chest',
      name: 'Chest',
      previousCm: 98.5,
      latestCm: null,
      changeCm: null,
      change: 'unavailable',
    });
  });

  it('never compares different measurements', () => {
    // Earlier: chest only; latest: waist only — nothing in common, even with similar values.
    const result = compareMeasurements([m('chest', 90)], [m('waist', 90)]);
    expect(result.comparableCount).toBe(0);
    expect(result.rows.every((r) => r.change === 'unavailable' && r.changeCm === null)).toBe(true);
    // Matching is by measurement id, not by display name.
    const renamed = compareMeasurements([{ ...m('chest', 90), name: 'Waist' }], [m('waist', 92)]);
    expect(renamed.comparableCount).toBe(0);
  });

  it('reports no comparable measurements for disjoint or empty records', () => {
    expect(compareMeasurements([m('chest', 98)], [m('hip', 100)]).comparableCount).toBe(0);
    expect(compareMeasurements([], [m('hip', 100)]).comparableCount).toBe(0);
    expect(compareMeasurements([m('hip', 100)], []).comparableCount).toBe(0);
  });

  it('orders rows by the latest record, then measurements only the earlier record has', () => {
    const ids = compareMeasurements([m('hip', 100), m('chest', 98)], [m('waist', 86), m('chest', 99)]).rows.map((r) => r.id);
    expect(ids).toEqual(['waist', 'chest', 'hip']);
  });

  it('is deterministic', () => {
    const previous = [m('chest', 98.5), m('waist', 88)];
    const latest = [m('chest', 101), m('waist', 86.5)];
    expect(compareMeasurements(previous, latest)).toEqual(compareMeasurements(previous, latest));
  });
});
