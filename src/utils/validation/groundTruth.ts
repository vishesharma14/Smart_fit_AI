import type { TapeMeasurement, ValidationMeasurementId } from '../../types/validation';
import {
  MAX_NOTES_LENGTH,
  SUBJECT_ID_PATTERN,
  VALIDATION_HEIGHT_RANGE,
  VALIDATION_LABELS,
  VALIDATION_MEASUREMENTS,
} from './definitions';

/*
 * Ground truth = manual tape measurements typed in by the person who measured the subject. Nothing here fills
 * in, estimates or rounds a value: a measurement left empty is simply not part of the ground truth.
 */

export type SubjectField = 'subjectId' | 'heightCm';
export type GroundTruthErrors = Partial<Record<SubjectField | ValidationMeasurementId | `${ValidationMeasurementId}-notes`, string>>;

export interface GroundTruthDraft {
  subjectId: string;
  heightCm: string;
  values: Partial<Record<ValidationMeasurementId, string>>;
  notes: Partial<Record<ValidationMeasurementId, string>>;
}

export type GroundTruthParse =
  | { ok: true; subjectId: string; heightCm: number; groundTruth: TapeMeasurement[] }
  | { ok: false; errors: GroundTruthErrors };

export function emptyGroundTruthDraft(): GroundTruthDraft {
  return { subjectId: '', heightCm: '', values: {}, notes: {} };
}

export function subjectIdError(subjectId: string): string | null {
  if (!subjectId.trim()) return 'Enter an anonymous subject ID.';
  if (!SUBJECT_ID_PATTERN.test(subjectId.trim()))
    return 'Use 2–24 letters, digits or hyphens (an anonymous code such as P-001, not a name).';
  return null;
}

/** Strict decimal number: digits with an optional decimal point or comma; nothing else. */
function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Error for a tape value (cm), or null when acceptable. */
export function tapeValueError(id: ValidationMeasurementId, value: number): string | null {
  const def = VALIDATION_MEASUREMENTS.find((m) => m.id === id);
  if (!def) return 'Unknown measurement.';
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (value <= 0) return 'Must be greater than 0.';
  if (value < def.minCm || value > def.maxCm) return `Expected ${def.minCm}–${def.maxCm} cm. Check the value and unit.`;
  return null;
}

export function heightError(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Enter the tape-measured height in cm.';
  if (value < VALIDATION_HEIGHT_RANGE.minCm || value > VALIDATION_HEIGHT_RANGE.maxCm)
    return `Expected ${VALIDATION_HEIGHT_RANGE.minCm}–${VALIDATION_HEIGHT_RANGE.maxCm} cm.`;
  return null;
}

/** Turns the typed form into ground truth, or field errors. Empty measurements are left out (not measured). */
export function parseGroundTruthDraft(draft: GroundTruthDraft): GroundTruthParse {
  const errors: GroundTruthErrors = {};
  const idError = subjectIdError(draft.subjectId);
  if (idError) errors.subjectId = idError;

  const height = parseDecimal(draft.heightCm);
  const hError = height === null ? 'Enter the tape-measured height in cm.' : heightError(height);
  if (hError) errors.heightCm = hError;

  const groundTruth: TapeMeasurement[] = [];
  for (const def of VALIDATION_MEASUREMENTS) {
    const raw = draft.values[def.id]?.trim() ?? '';
    const notes = draft.notes[def.id]?.trim() ?? '';
    if (notes.length > MAX_NOTES_LENGTH) errors[`${def.id}-notes`] = `Keep notes under ${MAX_NOTES_LENGTH} characters.`;
    if (!raw) continue;
    const value = parseDecimal(raw);
    const error = value === null ? 'Enter a number in cm (e.g. 92.5).' : tapeValueError(def.id, value);
    if (error || value === null) {
      errors[def.id] = error ?? 'Enter a number.';
      continue;
    }
    groundTruth.push({ name: def.id, value, unit: 'cm', ...(notes ? { notes } : {}) });
  }
  if (!errors.heightCm && groundTruth.length === 0 && !VALIDATION_MEASUREMENTS.some((m) => errors[m.id]))
    errors[VALIDATION_MEASUREMENTS[0].id] = 'Enter at least one tape measurement.';

  if (Object.keys(errors).length > 0 || height === null) return { ok: false, errors };
  return { ok: true, subjectId: draft.subjectId.trim(), heightCm: height, groundTruth };
}

/** Checks already-structured ground truth (e.g. before use or export). Returns the problems found. */
export function validateGroundTruth(groundTruth: readonly TapeMeasurement[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const tape of groundTruth) {
    const known = VALIDATION_MEASUREMENTS.some((m) => m.id === tape.name);
    const label = known ? VALIDATION_LABELS[tape.name] : String(tape.name);
    if (!known) {
      problems.push(`${label}: unknown measurement.`);
      continue;
    }
    if (seen.has(tape.name)) problems.push(`${label}: entered more than once.`);
    seen.add(tape.name);
    if (tape.unit !== 'cm') problems.push(`${label}: unit must be cm.`);
    const error = typeof tape.value === 'number' ? tapeValueError(tape.name, tape.value) : 'Enter a number.';
    if (error) problems.push(`${label}: ${error}`);
    if (tape.notes !== undefined && (typeof tape.notes !== 'string' || tape.notes.length > MAX_NOTES_LENGTH))
      problems.push(`${label}: notes must be text under ${MAX_NOTES_LENGTH} characters.`);
  }
  return problems;
}

/** The tape value for a measurement, or null when it was not measured. */
export function truthFor(groundTruth: readonly TapeMeasurement[], id: ValidationMeasurementId): TapeMeasurement | null {
  return groundTruth.find((t) => t.name === id) ?? null;
}
