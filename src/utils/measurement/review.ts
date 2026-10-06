import type {
  ConfirmedMeasurements,
  Measurement,
  MeasurementStatus,
  ReviewedMeasurement,
  ScanMeasurementResult,
} from '../../types/measurement';
import { CONFIDENCE_THRESHOLDS } from './aggregate';

/*
 * Review and confirmation rules for the engine's measurements. Pure: the
 * review page only calls these.
 *
 * - Only a measurement the engine gave a value for (valid or uncertain, in cm)
 *   can be edited; invalid and unsupported ones stay without a value.
 * - An edit replaces the value only; status and confidence stay the engine's,
 *   and the measurement is flagged `manuallyEdited`.
 * - Entered text is accepted exactly as typed or rejected with a reason; it is
 *   never rounded, clamped or otherwise changed.
 */

/** Largest value accepted for a body length (cm); anything above is treated as a typing error. */
export const MAX_EDIT_CM = 300;
/** Decimal places accepted in an entered value. */
export const MAX_EDIT_DECIMALS = 1;

export function toReviewed(measurement: Measurement): ReviewedMeasurement {
  return { ...measurement, measuredValue: measurement.value, manuallyEdited: false };
}

/** Starting point for the review: the confirmed set when it belongs to this scan, otherwise the engine output. */
export function initialReview(
  result: ScanMeasurementResult,
  confirmed: ConfirmedMeasurements | null,
): ReviewedMeasurement[] {
  if (confirmed && confirmed.measuredAt === result.measuredAt) return confirmed.measurements;
  return result.report.measurements.map(toReviewed);
}

/** Whether the user may type a value for this measurement. */
export function isEditable(measurement: Pick<Measurement, 'status' | 'unit'> & { measuredValue: number | null }): boolean {
  return (
    measurement.measuredValue !== null &&
    (measurement.status === 'valid' || measurement.status === 'uncertain') &&
    measurement.unit === 'cm'
  );
}

export type ParsedInput = { ok: true; value: number } | { ok: false; error: string };

/** Validates a typed value (cm). */
export function parseMeasurementInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a value in cm.' };
  if (trimmed.startsWith('-')) return { ok: false, error: 'The value can’t be negative.' };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, error: 'Enter a number, e.g. 42.5.' };
  const decimals = trimmed.split('.')[1]?.length ?? 0;
  if (decimals > MAX_EDIT_DECIMALS) return { ok: false, error: `Use at most ${MAX_EDIT_DECIMALS} decimal place.` };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'The value must be greater than 0.' };
  if (value > MAX_EDIT_CM) return { ok: false, error: `That’s more than ${MAX_EDIT_CM} cm. Check the value.` };
  return { ok: true, value };
}

/**
 * The measurement with a user-entered value. Returns it unchanged when it
 * isn't editable, so an unsupported or invalid measurement can never gain a value.
 */
export function applyEdit(measurement: ReviewedMeasurement, value: number): ReviewedMeasurement {
  if (!isEditable(measurement) || !Number.isFinite(value) || value <= 0) return measurement;
  return { ...measurement, value, manuallyEdited: value !== measurement.measuredValue };
}

export type DraftValues = Partial<Record<Measurement['id'], string>>;

export type DraftResult =
  | { ok: true; measurements: ReviewedMeasurement[] }
  | { ok: false; errors: Partial<Record<Measurement['id'], string>> };

/** Applies all drafts at once, or none of them when any draft is invalid. */
export function applyDrafts(measurements: ReviewedMeasurement[], drafts: DraftValues): DraftResult {
  const errors: Partial<Record<Measurement['id'], string>> = {};
  const next = measurements.map((measurement) => {
    const draft = drafts[measurement.id];
    if (draft === undefined || !isEditable(measurement)) return measurement;
    const parsed = parseMeasurementInput(draft);
    if (!parsed.ok) {
      errors[measurement.id] = parsed.error;
      return measurement;
    }
    return applyEdit(measurement, parsed.value);
  });
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, measurements: next };
}

/** Text for an editable field: the current value as stored (no reformatting). */
export function draftFor(measurement: ReviewedMeasurement): string {
  return measurement.value === null ? '' : String(measurement.value);
}

export function confirmMeasurements(
  result: ScanMeasurementResult,
  measurements: ReviewedMeasurement[],
  now: Date = new Date(),
): ConfirmedMeasurements {
  return {
    region: result.report.region,
    clothingType: result.clothingType,
    measurements,
    calibration: result.report.calibration,
    measuredAt: result.measuredAt,
    confirmedAt: now.toISOString(),
    ...(result.demo ? { demo: true as const } : {}),
  };
}

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

/** Words for a computed measurement's confidence (same thresholds as the statuses); null when there is none. */
export function confidenceLevel(measurement: Pick<Measurement, 'confidence' | 'status'>): ConfidenceLevel | null {
  if (measurement.status === 'unsupported' || measurement.status === 'invalid') return null;
  if (measurement.confidence >= CONFIDENCE_THRESHOLDS.valid) return 'High';
  if (measurement.confidence >= CONFIDENCE_THRESHOLDS.uncertain) return 'Medium';
  return 'Low';
}

export const STATUS_LABELS: Record<MeasurementStatus, string> = {
  valid: 'Valid',
  uncertain: 'Uncertain',
  invalid: 'Invalid',
  unsupported: 'Unsupported',
};
