import type { ValidationSubject } from '../../types/validation';
import { compareAttempt, VALIDATION_SOURCES, type MeasurementComparison } from './compare';
import { summarizeValidation, type ValidationSummary } from './metrics';
import { subjectRepeatability, type SubjectRepeatability } from './repeatability';

/*
 * Developer export of validation results (JSON or CSV): measurement values, metadata and metrics only.
 *
 * Every field is copied explicitly from the records (a whitelist), and `assertExportSafe` rejects anything that
 * could carry camera data — landmark/outline/mask/frame/image fields, binary arrays or data URLs — so camera
 * images, frames, segmentation masks or raw biometric images can never end up in an export.
 */

export const EXPORT_FORMAT = 'sizerai-validation-v1';
export const EXPORT_NOTICE =
  'Validation mode — experimental. Ground truth must come from manual tape measurements. These results are not yet validated for real-world clothing sizing. Contains measurement values and metrics only.';
export const SYNTHETIC_NOTICE = 'Contains SYNTHETIC test data. Synthetic results do not represent real-person accuracy.';

/** Keys that could carry camera or body-image data. */
const FORBIDDEN_KEY = /landmark|silhouette|outline|mask|frame|image|photo|video|pixel|capture(?!d)|blob|buffer|base64/i;
const MAX_STRING = 500;

/** Throws if the value contains anything other than plain numbers, short strings, booleans, null, arrays and objects with safe keys. */
export function assertExportSafe(value: unknown, path = 'export'): void {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (/^\s*(data|blob):/i.test(value)) throw new Error(`Privacy: ${path} looks like an image or binary URL.`);
    if (value.length > MAX_STRING) throw new Error(`Privacy: ${path} is too long to be a measurement field.`);
    return;
  }
  if (typeof value !== 'object') throw new Error(`Privacy: ${path} has an unsupported type.`);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) throw new Error(`Privacy: ${path} is binary data.`);
  if (typeof Blob !== 'undefined' && value instanceof Blob) throw new Error(`Privacy: ${path} is a file.`);
  if (typeof ImageData !== 'undefined' && value instanceof ImageData) throw new Error(`Privacy: ${path} is image data.`);
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertExportSafe(item, `${path}[${i}]`));
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(`Privacy: ${path} is not a plain object.`);
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`Privacy: ${path}.${key} is not allowed in an export.`);
    assertExportSafe(item, `${path}.${key}`);
  }
}

const r2 = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;

function exportComparison(row: MeasurementComparison) {
  const source = (s: MeasurementComparison['ellipse']) => ({
    predictedCm: r2(s.predictedCm),
    status: s.status,
    unavailable: s.unavailable,
    reason: s.reason ?? null,
    absErrorCm: r2(s.error?.absCm),
    signedErrorCm: r2(s.error?.signedCm),
    percentError: r2(s.error?.percent),
  });
  return { measurement: row.id, tapeCm: r2(row.truthCm), ellipse: source(row.ellipse), anny: source(row.anny) };
}

function exportSummary(summary: ValidationSummary) {
  const round = (s: ValidationSummary['ellipse']['overall']) => ({
    validComparisons: s.count,
    unavailable: s.unavailable,
    maeCm: r2(s.maeCm),
    biasCm: r2(s.biasCm),
    medianAbsErrorCm: r2(s.medianAbsCm),
    maxAbsErrorCm: r2(s.maxAbsCm),
  });
  return Object.fromEntries(
    VALIDATION_SOURCES.map((source) => [
      source,
      {
        overall: round(summary[source].overall),
        byMeasurement: Object.fromEntries(Object.entries(summary[source].byMeasurement).map(([id, s]) => [id, round(s)])),
      },
    ]),
  );
}

function exportRepeatability(rep: SubjectRepeatability) {
  return {
    subjectId: rep.subjectId,
    note: 'Differences between scans of the same subject; not errors (no scan is ground truth).',
    pairs: rep.pairs.map((pair) => ({
      baselineAttempt: pair.baselineAttempt,
      repeatAttempt: pair.repeatAttempt,
      ...Object.fromEntries(
        VALIDATION_SOURCES.map((source) => [
          source,
          pair[source].map((d) => ({ measurement: d.id, baselineCm: r2(d.baselineCm), repeatCm: r2(d.repeatCm), differenceCm: r2(d.differenceCm) })),
        ]),
      ),
    })),
  };
}

/** Plain export object built field by field from the records. */
export function buildExport(subjects: readonly ValidationSubject[], now = new Date()) {
  const synthetic = subjects.some((s) => s.synthetic);
  const data = {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    notice: EXPORT_NOTICE,
    synthetic,
    ...(synthetic ? { syntheticNotice: SYNTHETIC_NOTICE } : {}),
    subjects: subjects.map((subject) => ({
      subjectId: subject.subjectId,
      synthetic: subject.synthetic,
      heightCm: r2(subject.heightCm),
      groundTruth: subject.groundTruth.map((t) => ({ name: t.name, value: r2(t.value), unit: t.unit, notes: t.notes ?? null })),
      attempts: subject.attempts.map((a) => ({
        attempt: a.attempt,
        timestamp: a.timestamp,
        clothingType: a.clothingType,
        clothingFit: a.clothingFit,
        deviceType: a.deviceType,
        cameraType: a.cameraType,
        lighting: a.lighting,
        enteredHeightCm: r2(a.enteredHeightCm),
        viewsCaptured: [...a.viewsCaptured],
        ellipseCalibration: a.ellipseCalibration,
        anny: {
          status: a.annyInfo.status,
          reason: a.annyInfo.reason ?? null,
          fitErrorCm: r2(a.annyInfo.rmsResidualCm),
          heightErrorCm: r2(a.annyInfo.heightErrorCm),
          iterations: a.annyInfo.iterations,
          workerMs: a.annyInfo.workerMs,
          viewsUsed: [...a.annyInfo.viewsUsed],
        },
        comparisons: compareAttempt(subject, a).map(exportComparison),
      })),
    })),
    summary: exportSummary(summarizeValidation(subjects)),
    repeatability: subjects.flatMap((s) => {
      const rep = subjectRepeatability(s);
      return rep ? [exportRepeatability(rep)] : [];
    }),
  };
  assertExportSafe(data);
  return data;
}

export function toValidationJson(subjects: readonly ValidationSubject[], now = new Date()): string {
  return JSON.stringify(buildExport(subjects, now), null, 2);
}

export const CSV_COLUMNS = [
  'subject_id',
  'synthetic',
  'attempt',
  'timestamp',
  'device_type',
  'camera_type',
  'lighting',
  'clothing_type',
  'clothing_fit',
  'height_cm',
  'entered_height_cm',
  'views_captured',
  'measurement',
  'tape_cm',
  'tape_notes',
  'ellipse_cm',
  'ellipse_status',
  'ellipse_unavailable',
  'ellipse_abs_error_cm',
  'ellipse_signed_error_cm',
  'ellipse_percent_error',
  'anny_cm',
  'anny_status',
  'anny_unavailable',
  'anny_abs_error_cm',
  'anny_signed_error_cm',
  'anny_percent_error',
  'anny_fit_error_cm',
  'anny_height_error_cm',
  'anny_worker_ms',
] as const;

/** One CSV cell: quoted when needed; text that a spreadsheet would run as a formula is prefixed with '. */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value !== 'string') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per subject × attempt × measurement, with a SYNTHETIC/notice comment line first. */
export function toValidationCsv(subjects: readonly ValidationSubject[], now = new Date()): string {
  const data = buildExport(subjects, now);
  const lines = [`# ${data.notice}${data.synthetic ? ` ${SYNTHETIC_NOTICE}` : ''}`, CSV_COLUMNS.join(',')];
  data.subjects.forEach((subject, si) => {
    const source = subjects[si];
    subject.attempts.forEach((a) => {
      for (const c of a.comparisons) {
        const notes = source.groundTruth.find((t) => t.name === c.measurement)?.notes ?? null;
        const cells: (string | number | boolean | null)[] = [
          subject.subjectId,
          subject.synthetic,
          a.attempt,
          a.timestamp,
          a.deviceType,
          a.cameraType,
          a.lighting,
          a.clothingType,
          a.clothingFit,
          subject.heightCm,
          a.enteredHeightCm,
          a.viewsCaptured.join(' '),
          c.measurement,
          c.tapeCm,
          notes,
          c.ellipse.predictedCm,
          c.ellipse.status,
          c.ellipse.unavailable,
          c.ellipse.absErrorCm,
          c.ellipse.signedErrorCm,
          c.ellipse.percentError,
          c.anny.predictedCm,
          c.anny.status,
          c.anny.unavailable,
          c.anny.absErrorCm,
          c.anny.signedErrorCm,
          c.anny.percentError,
          a.anny.fitErrorCm,
          a.anny.heightErrorCm,
          a.anny.workerMs,
        ];
        lines.push(cells.map(csvCell).join(','));
      }
    });
  });
  return `${lines.join('\n')}\n`;
}
