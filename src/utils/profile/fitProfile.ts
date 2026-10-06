import type { ConfirmedMeasurements } from '../../types/measurement';
import type { FitProfile, SavedMeasurement, ScanRecord } from '../../types/profile';
import { SIZE_LABELS, type SizeRecommendation, type SizingBrandId } from '../../types/sizing';
import { DEFAULT_FIT_PREFERENCE, isFitPreference } from '../clothingCatalog';
import { DEFAULT_SIZING_BRAND, isSizingBrandId } from '../sizing/brandCharts';

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

/** A recommendation, optionally from a reference brand chart (Step 15; none = Generic). */
type ProfileRecommendation = SizeRecommendation & { brand?: SizingBrandId };

/** The profile to save, or null when the recommendation has no size. */
export function buildFitProfile(
  confirmed: ConfirmedMeasurements,
  recommendation: ProfileRecommendation,
  now: Date = new Date(),
): FitProfile | null {
  if (recommendation.status !== 'recommended' || !recommendation.size || !recommendation.garment) return null;
  return {
    id: recordId(confirmed.measuredAt, recommendation.garment),
    garment: recommendation.garment,
    size: recommendation.size,
    fit: recommendation.fit,
    fitPreference: recommendation.fitPreference,
    brand: recommendation.brand ?? DEFAULT_SIZING_BRAND,
    alternativeSize: recommendation.alternativeSize,
    basedOnUncertain: recommendation.basedOnUncertain,
    chartName: recommendation.chartName ?? '',
    measuredAt: confirmed.measuredAt,
    confirmedAt: confirmed.confirmedAt,
    savedAt: now.toISOString(),
    measurements: savedMeasurementsFrom(confirmed),
  };
}

/**
 * The history entry for a saved profile: a snapshot of the result as it was saved (Step 16 adds the fit preference,
 * brand and measurements), so later chart or preference changes never alter it. Numbers and labels only.
 */
export function toScanRecord(profile: FitProfile): ScanRecord {
  const { id, garment, size, fit, measuredAt, savedAt, fitPreference, brand, measurements } = profile;
  return { id, garment, size, fit, measuredAt, savedAt, fitPreference, brand, measurements: measurements.map((m) => ({ ...m })) };
}

/** Adds (or replaces, for the same scan + garment) a record at the front, keeping at most MAX_SCAN_HISTORY. */
export function upsertHistory(history: readonly ScanRecord[], record: ScanRecord): ScanRecord[] {
  return [record, ...history.filter((r) => r.id !== record.id)].slice(0, MAX_SCAN_HISTORY);
}

/** Whether the profile was saved from exactly this confirmation (same scan, garment and confirmation). */
export function isSavedFrom(profile: FitProfile | null, confirmed: ConfirmedMeasurements | null, recommendation: ProfileRecommendation): boolean {
  return Boolean(
    profile &&
      confirmed &&
      profile.measuredAt === confirmed.measuredAt &&
      profile.confirmedAt === confirmed.confirmedAt &&
      profile.garment === recommendation.garment &&
      profile.size === recommendation.size &&
      profile.fitPreference === recommendation.fitPreference &&
      profile.brand === (recommendation.brand ?? DEFAULT_SIZING_BRAND),
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

/** A complete saved measurement (as written by `savedMeasurementsFrom`). */
export function isSavedMeasurement(value: unknown): value is SavedMeasurement {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    isString(m.id) &&
    isString(m.name) &&
    typeof m.valueCm === 'number' &&
    Number.isFinite(m.valueCm) &&
    isString(m.status) &&
    typeof m.confidence === 'number' &&
    Number.isFinite(m.confidence) &&
    typeof m.manuallyEdited === 'boolean'
  );
}

/**
 * A stored history record as the app uses it. The Step 16 snapshot fields are kept only when valid; a record saved
 * before them (or with a malformed snapshot field) simply has no such field — nothing is defaulted or guessed, and the
 * measurement snapshot is kept only when every entry is intact. Returns null for anything that is not a record.
 */
export function normalizeScanRecord(value: unknown): ScanRecord | null {
  if (!isScanRecord(value)) return null;
  const { id, garment, size, fit, measuredAt, savedAt, fitPreference, brand, measurements } = value as ScanRecord & Record<string, unknown>;
  const record: ScanRecord = { id, garment, size, fit, measuredAt, savedAt };
  if (isFitPreference(fitPreference)) record.fitPreference = fitPreference;
  if (isSizingBrandId(brand)) record.brand = brand;
  if (Array.isArray(measurements) && measurements.every(isSavedMeasurement)) record.measurements = measurements;
  return record;
}

/**
 * A stored profile as the app uses it: a missing or unknown fit preference (profiles saved before fit preferences
 * existed) becomes Regular, and a missing or unknown brand (saved before Step 15) becomes Generic. Returns null for
 * anything that is not a valid profile.
 */
export function normalizeFitProfile(value: unknown): FitProfile | null {
  if (!isFitProfile(value)) return null;
  const { fitPreference, brand } = value as { fitPreference?: unknown; brand?: unknown };
  return {
    ...value,
    fitPreference: isFitPreference(fitPreference) ? fitPreference : DEFAULT_FIT_PREFERENCE,
    brand: isSizingBrandId(brand) ? brand : DEFAULT_SIZING_BRAND,
  };
}

/** Structure check for stored profiles (fit preference and brand are optional here; see `normalizeFitProfile`). */
export function isFitProfile(value: unknown): value is FitProfile {
  if (!isScanRecord(value)) return false;
  const p = value as unknown as Record<string, unknown>;
  return (
    isString(p.confirmedAt) &&
    Array.isArray(p.measurements) &&
    p.measurements.every((m) => m && typeof m === 'object' && isString(m.id) && isString(m.name) && typeof m.valueCm === 'number' && Number.isFinite(m.valueCm))
  );
}
