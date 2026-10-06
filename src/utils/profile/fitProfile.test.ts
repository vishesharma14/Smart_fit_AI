import { describe, expect, it } from 'vitest';
import type { FitProfile, ScanRecord } from '../../types/profile';
import { isFitProfile, isScanRecord, MAX_SCAN_HISTORY, normalizeScanRecord, toScanRecord, upsertHistory } from './fitProfile';

const record = (i: number, id = `scan-${i}`): ScanRecord => ({
  id,
  garment: 't-shirt',
  size: 'M',
  fit: 'good-fit',
  measuredAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  savedAt: '2026-02-01T00:00:00.000Z',
});

describe('fit profile helpers', () => {
  it('keeps history newest first, replaces the same scan and caps the length', () => {
    let history: ScanRecord[] = [];
    for (let i = 0; i < MAX_SCAN_HISTORY + 3; i += 1) history = upsertHistory(history, record(i));
    expect(history).toHaveLength(MAX_SCAN_HISTORY);
    expect(history[0].id).toBe(`scan-${MAX_SCAN_HISTORY + 2}`);
    history = upsertHistory(history, { ...record(5), id: history[3].id, size: 'L' });
    expect(history).toHaveLength(MAX_SCAN_HISTORY);
    expect(history[0].size).toBe('L');
    expect(new Set(history.map((r) => r.id)).size).toBe(history.length);
  });

  it('rejects malformed stored data', () => {
    expect(isScanRecord(record(0))).toBe(true);
    expect(isScanRecord({ ...record(0), size: 'XXXL' })).toBe(false);
    expect(isScanRecord(null)).toBe(false);
    expect(isFitProfile({ ...record(0), confirmedAt: 'x', measurements: [{ id: 'chest', name: 'Chest', valueCm: 'big' }] })).toBe(false);
    expect(isFitProfile({ ...record(0), confirmedAt: 'x', measurements: [{ id: 'chest', name: 'Chest', valueCm: 98 }] })).toBe(true);
  });
});

describe('history snapshots (Step 16)', () => {
  const chest = { id: 'chest', name: 'Chest', valueCm: 98.46, status: 'uncertain', confidence: 0.6, manuallyEdited: false } as const;
  const profile: FitProfile = {
    ...record(0),
    fitPreference: 'slim',
    brand: 'nike',
    alternativeSize: null,
    basedOnUncertain: true,
    chartName: 'Nike reference T-shirt chart (chest)',
    confirmedAt: '2026-01-01T00:00:30.000Z',
    measurements: [chest],
  };

  it('keeps the fit preference, brand and measurements with each saved result', () => {
    const snapshot = toScanRecord(profile);
    expect(snapshot).toEqual({ ...record(0), fitPreference: 'slim', brand: 'nike', measurements: [chest] });
    expect(snapshot.measurements![0]).not.toBe(profile.measurements[0]); // a copy, not shared with the profile
  });

  it('loads records saved before Step 16 unchanged, without inventing brand, preference or measurements', () => {
    const old = normalizeScanRecord(record(0));
    expect(old).toEqual(record(0));
    expect(old).not.toHaveProperty('brand');
    expect(old).not.toHaveProperty('fitPreference');
    expect(old).not.toHaveProperty('measurements');
  });

  it('round-trips a snapshot through storage', () => {
    const stored = JSON.parse(JSON.stringify(toScanRecord(profile)));
    expect(normalizeScanRecord(stored)).toEqual(toScanRecord(profile));
  });

  it('drops malformed snapshot fields but keeps the record', () => {
    const r = normalizeScanRecord({ ...record(0), brand: 'acme', fitPreference: 'baggy', measurements: [chest, { id: 'waist', name: 'Waist', valueCm: 'big' }] });
    expect(r).toEqual(record(0));
    expect(normalizeScanRecord({ ...record(0), measurements: 'chest' })).toEqual(record(0));
    expect(normalizeScanRecord({ ...record(0), brand: 'generic', measurements: [] })).toEqual({ ...record(0), brand: 'generic', measurements: [] });
    expect(normalizeScanRecord({ ...record(0), size: 'XXXL' })).toBeNull();
  });
});
