import { describe, expect, it } from 'vitest';
import type { ReviewedMeasurement, ScanMeasurementResult } from '../../types/measurement';
import { measureScan } from './measureScan';
import {
  applyDrafts,
  applyEdit,
  confidenceLevel,
  confirmMeasurements,
  initialReview,
  isEditable,
  parseMeasurementInput,
  toReviewed,
} from './review';
import { makeCaptures } from './testFixtures';

// Real engine output: full body with a height calibration (valid lengths, unsupported girths).
const report = measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 170 });
const result: ScanMeasurementResult = { report, clothingType: null, measuredAt: '2026-01-01T00:00:00.000Z' };
const reviewed = report.measurements.map(toReviewed);
const byId = (list: ReviewedMeasurement[], id: ReviewedMeasurement['id']) => list.find((m) => m.id === id)!;

describe('parseMeasurementInput', () => {
  it('accepts positive numbers exactly as typed', () => {
    expect(parseMeasurementInput('42')).toEqual({ ok: true, value: 42 });
    expect(parseMeasurementInput(' 42.5 ')).toEqual({ ok: true, value: 42.5 });
  });

  it('rejects empty, negative, zero and non-numeric input', () => {
    for (const text of ['', '   ', '-3', '0', '0.0', 'abc', '4,5', '1e3', '12cm', 'NaN', 'Infinity', '.5']) {
      expect(parseMeasurementInput(text).ok).toBe(false);
    }
  });

  it('rejects more decimals than allowed instead of rounding', () => {
    expect(parseMeasurementInput('42.55')).toMatchObject({ ok: false });
  });

  it('rejects implausibly large values', () => {
    expect(parseMeasurementInput('301')).toMatchObject({ ok: false });
    expect(parseMeasurementInput('300')).toEqual({ ok: true, value: 300 });
  });
});

describe('isEditable / applyEdit', () => {
  it('allows editing measurements with a value only', () => {
    expect(isEditable(byId(reviewed, 'shoulder-width'))).toBe(true);
    expect(isEditable(byId(reviewed, 'chest'))).toBe(false);
  });

  it('marks an edited value as manual and keeps status and confidence', () => {
    const shoulders = byId(reviewed, 'shoulder-width');
    const edited = applyEdit(shoulders, 45.5);
    expect(edited).toMatchObject({
      value: 45.5,
      manuallyEdited: true,
      measuredValue: shoulders.value,
      status: shoulders.status,
      confidence: shoulders.confidence,
    });
  });

  it('is not marked edited when the measured value is entered again', () => {
    const shoulders = byId(reviewed, 'shoulder-width');
    expect(applyEdit(applyEdit(shoulders, 45.5), shoulders.measuredValue!).manuallyEdited).toBe(false);
  });

  it('never gives an unsupported or invalid measurement a value', () => {
    const chest = byId(reviewed, 'chest');
    expect(applyEdit(chest, 95)).toBe(chest);
    const invalid: ReviewedMeasurement = { ...byId(reviewed, 'arm-length'), status: 'invalid', value: null, measuredValue: null };
    expect(applyEdit(invalid, 60)).toBe(invalid);
  });

  it('keeps an uncertain measurement uncertain after an edit', () => {
    const uncertain = measureScan({ captures: makeCaptures(), region: 'full' }).measurements.map(toReviewed);
    const arm = byId(uncertain, 'arm-length');
    expect(arm.status).toBe('uncertain');
    expect(applyEdit(arm, 60).status).toBe('uncertain');
  });
});

describe('applyDrafts', () => {
  it('applies valid drafts', () => {
    const out = applyDrafts(reviewed, { 'shoulder-width': '44', 'arm-length': String(byId(reviewed, 'arm-length').value) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(byId(out.measurements, 'shoulder-width')).toMatchObject({ value: 44, manuallyEdited: true });
    expect(byId(out.measurements, 'arm-length').manuallyEdited).toBe(false);
  });

  it('applies nothing when any draft is invalid', () => {
    const out = applyDrafts(reviewed, { 'shoulder-width': '44', 'arm-length': '-5' });
    expect(out).toEqual({ ok: false, errors: { 'arm-length': expect.any(String) } });
  });

  it('ignores drafts for measurements that cannot be edited', () => {
    const out = applyDrafts(reviewed, { chest: '95' });
    expect(out.ok && byId(out.measurements, 'chest').value).toBeNull();
  });
});

describe('confirmMeasurements', () => {
  it('keeps every measurement with name, value, unit, confidence, status and edit flag', () => {
    const edited = reviewed.map((m) => (m.id === 'shoulder-width' ? applyEdit(m, 44) : m));
    const confirmed = confirmMeasurements(result, edited, new Date('2026-01-01T00:05:00Z'));
    expect(confirmed).toMatchObject({
      region: 'full',
      clothingType: null,
      calibration: report.calibration,
      measuredAt: result.measuredAt,
      confirmedAt: '2026-01-01T00:05:00.000Z',
    });
    expect(confirmed.measurements).toHaveLength(report.measurements.length);
    const shoulders = byId(confirmed.measurements, 'shoulder-width');
    expect(shoulders).toMatchObject({ name: 'Shoulder width', value: 44, unit: 'cm', status: 'valid', manuallyEdited: true });
    expect(byId(confirmed.measurements, 'chest')).toMatchObject({ value: null, status: 'unsupported', manuallyEdited: false });
  });
});

describe('initialReview', () => {
  it('starts from the engine output, or from the confirmed set of the same scan', () => {
    expect(initialReview(result, null)).toEqual(reviewed);
    const confirmed = confirmMeasurements(result, [applyEdit(reviewed[0], 44), ...reviewed.slice(1)]);
    expect(initialReview(result, confirmed)).toBe(confirmed.measurements);
    expect(initialReview({ ...result, measuredAt: 'other' }, confirmed)).toEqual(reviewed);
  });
});

describe('confidenceLevel', () => {
  it('uses the engine thresholds and has no level without a value', () => {
    expect(confidenceLevel({ confidence: 0.7, status: 'valid' })).toBe('High');
    expect(confidenceLevel({ confidence: 0.4, status: 'uncertain' })).toBe('Medium');
    expect(confidenceLevel({ confidence: 0.1, status: 'uncertain' })).toBe('Low');
    expect(confidenceLevel({ confidence: 0, status: 'unsupported' })).toBeNull();
    expect(confidenceLevel({ confidence: 0, status: 'invalid' })).toBeNull();
  });
});
