import type { ConfirmedMeasurements } from '../../types/measurement';
import type { FitProfile, SavedMeasurement, ScanRecord } from '../../types/profile';
import { SIZE_LABELS, type SizeRecommendation } from '../../types/sizing';

/*
 * Builds the saved fit profile from the confirmed measurements and their size recommendation (Step 11).
 * Only a real recommendation can be saved: an insufficient-data result has no size, and none is invented.
 */

/** Keep this many saved results (newest first). */
export const MAX_SCAN_HISTORY = 10;

export const recordId = (measuredAt: string, garment: string) => `${measuredAt}|${garment}`;

/** Confirmed measurements that have a value in centimetres. */
export function savedMeasurementsFrom(confirmed: ConfirmedMeasurements): SavedMeasurement[] {
  return confirmed.measurements.flatMap((m) =>
    m.value !== null && m.unit === 'cm' && Number.isFinite(m.value)
      ? [{ id: m.id, name: m.name, valueCm: m.value, status: m.status, confidence: m.confidence, manuallyEdited: m.manuallyEdited }]
      : [],
  );
}

/** The profile to save, or null when the recommendation has no size. */
export function buildFitProfile(
  confirmed: ConfirmedMeasurements,
  recommendation: SizeRecommendation,
  now: Date = new Date(),
): FitProfile | null {
  if (recommendation.status !== 'recommended' || !recommendation.size || !recommendation.garment) return null;
  return {
    id: recordId(confirmed.measuredAt, recommendation.garment),
    garment: recommendation.garment,
    size: recommendation.size,
    fit: recommendation.fit,
    alternativeSize: recommendation.alternativeSize,
    basedOnUncertain: recommendation.basedOnUncertain,
    chartName: recommendation.chartName ?? '',
    measuredAt: confirmed.measuredAt,
    confirmedAt: confirmed.confirmedAt,
    savedAt: now.toISOString(),
    measurements: savedMeasurementsFrom(confirmed),
  };
}

export function toScanRecord(profile: FitProfile): ScanRecord {
  const { id, garment, size, fit, measuredAt, savedAt } = profile;
  return { id, garment, size, fit, measuredAt, savedAt };
}

/** Adds (or replaces, for the same scan + garment) a record at the front, keeping at most MAX_SCAN_HISTORY. */
export function upsertHistory(history: readonly ScanRecord[], record: ScanRecord): ScanRecord[] {
  return [record, ...history.filter((r) => r.id !== record.id)].slice(0, MAX_SCAN_HISTORY);
}

/** Whether the profile was saved from exactly this confirmation (same scan, garment and confirmation). */
export function isSavedFrom(profile: FitProfile | null, confirmed: ConfirmedMeasurements | null, recommendation: SizeRecommendation): boolean {
  return Boolean(
    profile &&
      confirmed &&
      profile.measuredAt === confirmed.measuredAt &&
      profile.confirmedAt === confirmed.confirmedAt &&
      profile.garment === recommendation.garment &&
      profile.size === recommendation.size,
  );
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isSize = (v: unknown) => (SIZE_LABELS as readonly unknown[]).includes(v);

/** Guards data read back from browser storage: anything malformed is dropped rather than shown. */
export function isScanRecord(value: unknown): value is ScanRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return isString(r.id) && isString(r.garment) && isSize(r.size) && isString(r.fit) && isString(r.measuredAt) && isString(r.savedAt);
}

export function isFitProfile(value: unknown): value is FitProfile {
  if (!isScanRecord(value)) return false;
  const p = value as unknown as Record<string, unknown>;
  return (
    isString(p.confirmedAt) &&
    Array.isArray(p.measurements) &&
    p.measurements.every((m) => m && typeof m === 'object' && isString(m.id) && isString(m.name) && typeof m.valueCm === 'number' && Number.isFinite(m.valueCm))
  );
}
