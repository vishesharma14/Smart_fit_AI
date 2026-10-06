import type { MeasurementId } from '../../types/measurement';
import type { SavedMeasurement } from '../../types/profile';

/*
 * Measurement comparison (Step 16): a saved history snapshot vs the latest saved measurements (the fit profile).
 *
 * Only the same measurement (same id; saved measurements are always in cm) is compared, and only when both records
 * have a value: change = latest − previous. Changes smaller than MEANINGFUL_CHANGE_CM count as "no meaningful
 * change". Missing values are never estimated. Descriptive only — no health, fitness or body-composition reading.
 */

/** Smallest change (cm) shown as an increase or decrease; anything smaller is "no meaningful change". */
export const MEANINGFUL_CHANGE_CM = 0.5;

/** Absorbs floating-point error in the subtraction (64.1 − 63.6 = 0.4999…), so a 0.5 cm change counts as 0.5 cm. */
const FLOAT_TOLERANCE_CM = 1e-9;

export type MeasurementChange = 'increase' | 'decrease' | 'no-change' | 'unavailable';

export interface MeasurementComparisonRow {
  id: MeasurementId;
  name: string;
  /** Value in the earlier record (cm), or null when that record has none. */
  previousCm: number | null;
  /** Value in the latest record (cm), or null when that record has none. */
  latestCm: number | null;
  /** latest − previous (cm, unrounded); null when either value is missing. */
  changeCm: number | null;
  change: MeasurementChange;
}

export interface MeasurementComparison {
  rows: MeasurementComparisonRow[];
  /** Measurements present in both records. Zero means there is nothing to compare. */
  comparableCount: number;
}

/** Classifies a difference (cm) with the one shared threshold. */
export function classifyChange(changeCm: number): Exclude<MeasurementChange, 'unavailable'> {
  if (Math.abs(changeCm) < MEANINGFUL_CHANGE_CM - FLOAT_TOLERANCE_CM) return 'no-change';
  return changeCm > 0 ? 'increase' : 'decrease';
}

/** Display text for a change, e.g. "+2.5 cm" / "−1.5 cm" (one decimal; the value itself is not rounded). */
export function formatChangeCm(changeCm: number): string {
  const rounded = Math.round(Math.abs(changeCm) * 10) / 10;
  const sign = changeCm > 0 ? '+' : changeCm < 0 ? '−' : '';
  return `${sign}${rounded.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`;
}

const valid = (m: SavedMeasurement) => Number.isFinite(m.valueCm);

/** First valid entry per measurement id, in record order. */
function byId(measurements: readonly SavedMeasurement[]): Map<MeasurementId, SavedMeasurement> {
  const map = new Map<MeasurementId, SavedMeasurement>();
  for (const m of measurements) if (valid(m) && !map.has(m.id)) map.set(m.id, m);
  return map;
}

/**
 * Compares two measurement snapshots by measurement id. Rows follow the latest record's order, then measurements only
 * the earlier record has.
 */
export function compareMeasurements(previous: readonly SavedMeasurement[], latest: readonly SavedMeasurement[]): MeasurementComparison {
  const before = byId(previous);
  const after = byId(latest);
  const ids = [...after.keys(), ...[...before.keys()].filter((id) => !after.has(id))];
  const rows = ids.map((id): MeasurementComparisonRow => {
    const p = before.get(id) ?? null;
    const l = after.get(id) ?? null;
    const name = (l ?? p)!.name;
    if (!p || !l) return { id, name, previousCm: p?.valueCm ?? null, latestCm: l?.valueCm ?? null, changeCm: null, change: 'unavailable' };
    const changeCm = l.valueCm - p.valueCm;
    return { id, name, previousCm: p.valueCm, latestCm: l.valueCm, changeCm, change: classifyChange(changeCm) };
  });
  return { rows, comparableCount: rows.filter((r) => r.change !== 'unavailable').length };
}
