import { describe, expect, it } from 'vitest';
import type { ScanRecord } from '../../types/profile';
import { isFitProfile, isScanRecord, MAX_SCAN_HISTORY, upsertHistory } from './fitProfile';

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
