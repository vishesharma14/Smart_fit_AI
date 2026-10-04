import { describe, expect, it } from 'vitest';
import type { AnnyShadowState } from '../../hooks/useAnnyShadow';
import type { ValidationSubject } from '../../types/validation';
import { makeSilhouetteCaptures } from '../measurement/testFixtures';
import { BODY } from '../silhouette/testBody';
import { compareAttempt, predictionError } from './compare';
import { assertExportSafe, buildExport, csvCell, CSV_COLUMNS, SYNTHETIC_NOTICE, toValidationCsv, toValidationJson } from './export';
import { buildScanAttempt, measureForValidation, recordAnny, recordEllipse } from './fromScan';
import { emptyGroundTruthDraft, parseGroundTruthDraft, validateGroundTruth, type GroundTruthDraft } from './groundTruth';
import { summarizeErrors, summarizeValidation } from './metrics';
import { subjectRepeatability } from './repeatability';
import {
  SYNTHETIC_ATTEMPT_1,
  SYNTHETIC_ATTEMPT_2,
  SYNTHETIC_ATTEMPT_3,
  SYNTHETIC_LABEL,
  syntheticAttempt,
  syntheticSubject,
} from './syntheticFixture';

// All subject data below is SYNTHETIC (tests only) and says nothing about real-person accuracy.

const draft = (change: Partial<GroundTruthDraft> = {}): GroundTruthDraft => ({
  ...emptyGroundTruthDraft(),
  subjectId: 'P-001',
  heightCm: '175',
  values: { chest: '100' },
  ...change,
});

describe('ground truth (manual tape measurements)', () => {
  it('accepts typed tape values exactly as entered, with unit cm and optional notes', () => {
    const parsed = parseGroundTruthDraft(draft({ values: { chest: '98.5', waist: '81,2' }, notes: { chest: 'over T-shirt' } }));
    expect(parsed).toEqual({
      ok: true,
      subjectId: 'P-001',
      heightCm: 175,
      groundTruth: [
        { name: 'chest', value: 98.5, unit: 'cm', notes: 'over T-shirt' },
        { name: 'waist', value: 81.2, unit: 'cm' },
      ],
    });
  });

  it('leaves missing measurements out instead of filling them in', () => {
    const parsed = parseGroundTruthDraft(draft({ values: { chest: '100', hip: '  ' } }));
    expect(parsed.ok && parsed.groundTruth.map((t) => t.name)).toEqual(['chest']);
  });

  it('requires at least one tape measurement and a height', () => {
    const parsed = parseGroundTruthDraft(draft({ values: {}, heightCm: '' }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.heightCm).toBeTruthy();
    const noValues = parseGroundTruthDraft(draft({ values: {} }));
    expect(!noValues.ok && noValues.errors.chest).toMatch(/at least one/);
  });

  it('rejects invalid values: text, negatives, zero, implausible values and non-anonymous IDs', () => {
    const parsed = parseGroundTruthDraft(
      draft({
        subjectId: 'Jane Doe',
        values: { chest: 'abc', waist: '-80', hip: '0', thigh: '9', inseam: '1e2', 'arm-length': 'Infinity' },
        notes: { waist: 'x'.repeat(201) },
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.errors).sort()).toEqual(
      ['arm-length', 'chest', 'hip', 'inseam', 'subjectId', 'thigh', 'waist', 'waist-notes'].sort(),
    );
    expect(parseGroundTruthDraft(draft({ subjectId: 'a@b.com' })).ok).toBe(false);
    expect(parseGroundTruthDraft(draft({ heightCm: '1750' })).ok).toBe(false);
  });

  it('validates structured ground truth: unknown names, units, duplicates, non-finite values', () => {
    expect(validateGroundTruth(syntheticSubject().groundTruth)).toEqual([]);
    const bad = [
      { name: 'chest', value: 100, unit: 'cm' },
      { name: 'chest', value: 101, unit: 'cm' },
      { name: 'waist', value: Number.NaN, unit: 'cm' },
      { name: 'hip', value: 100, unit: 'in' },
      { name: 'neck', value: 38, unit: 'cm' },
    ] as unknown as ValidationSubject['groundTruth'];
    const problems = validateGroundTruth(bad);
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toMatch(/more than once/);
    expect(problems.join(' ')).toMatch(/unit must be cm/);
    expect(problems.join(' ')).toMatch(/unknown measurement/);
  });
});

describe('comparison: tape vs current ellipse vs Anny shadow', () => {
  it('computes absolute, signed and percentage error', () => {
    expect(predictionError(104, 100)).toEqual({ signedCm: 4, absCm: 4, percent: 4 });
    const e = predictionError(57, 60);
    expect(e.signedCm).toBe(-3);
    expect(e.absCm).toBe(3);
    expect(e.percent).toBeCloseTo(5, 10);
  });

  it('marks unavailable predictions and never invents a value or error for them', () => {
    const rows = compareAttempt(syntheticSubject(), SYNTHETIC_ATTEMPT_2);
    const thigh = rows.find((r) => r.id === 'thigh')!;
    expect(thigh.truthCm).toBe(55);
    expect(thigh.ellipse).toMatchObject({ predictedCm: null, unavailable: true, error: null });
    for (const row of rows) expect(row.anny).toMatchObject({ predictedCm: null, unavailable: true, error: null });
    const chest = rows.find((r) => r.id === 'chest')!;
    expect(chest.ellipse.error).toEqual({ signedCm: 2, absCm: 2, percent: 2 });
  });

  it('gives no error where there is no tape value', () => {
    const leg = compareAttempt(syntheticSubject(), SYNTHETIC_ATTEMPT_1).find((r) => r.id === 'leg-length')!;
    expect(leg.truthCm).toBeNull();
    expect(leg.ellipse.predictedCm).toBe(90);
    expect(leg.ellipse.error).toBeNull();
  });
});

describe('summary metrics', () => {
  it('summarizes signed errors: MAE, bias, median, max, counts', () => {
    expect(summarizeErrors([4, -2, 1, 2, 1, -3], 1)).toEqual({
      count: 6,
      unavailable: 1,
      maeCm: 13 / 6,
      biasCm: 0.5,
      medianAbsCm: 2,
      maxAbsCm: 4,
    });
    expect(summarizeErrors([], 3)).toEqual({ count: 0, unavailable: 3, maeCm: null, biasCm: null, medianAbsCm: null, maxAbsCm: null });
  });

  it('computes metrics separately for ellipse and Anny and for each measurement', () => {
    const summary = summarizeValidation([syntheticSubject([SYNTHETIC_ATTEMPT_1, SYNTHETIC_ATTEMPT_2])]);
    // Ellipse: per attempt 6 valid (thigh unavailable; leg length not taped → counts as neither).
    expect(summary.ellipse.overall.count).toBe(12);
    expect(summary.ellipse.overall.unavailable).toBe(2);
    expect(summary.ellipse.byMeasurement.chest).toMatchObject({ count: 2, maeCm: 3, biasCm: 3, medianAbsCm: 3, maxAbsCm: 4 });
    expect(summary.ellipse.byMeasurement.thigh).toMatchObject({ count: 0, unavailable: 2, maeCm: null });
    expect(summary.ellipse.byMeasurement['leg-length']).toMatchObject({ count: 0, unavailable: 0 });
    // Anny: attempt 1 all 7 taped available (errors −2 +1 −1 −1 −1 0 +1), attempt 2 fit rejected.
    expect(summary.anny.overall).toMatchObject({ count: 7, unavailable: 7, maeCm: 1, medianAbsCm: 1, maxAbsCm: 2 });
    expect(summary.anny.overall.biasCm).toBeCloseTo(-3 / 7, 10);
    expect(summary.includesSynthetic).toBe(true);
    expect(summary.attempts).toBe(2);
  });
});

describe('repeatability', () => {
  it('compares scan 1 with scan 2 and scan 3 per engine, as differences (no ground truth involved)', () => {
    const rep = subjectRepeatability(syntheticSubject([SYNTHETIC_ATTEMPT_3, SYNTHETIC_ATTEMPT_1, SYNTHETIC_ATTEMPT_2]))!;
    expect(rep.pairs.map((p) => [p.baselineAttempt, p.repeatAttempt])).toEqual([
      [1, 2],
      [1, 3],
    ]);
    const chest = (pair: number, source: 'ellipse' | 'anny') => rep.pairs[pair][source].find((d) => d.id === 'chest')!;
    expect(chest(0, 'ellipse').differenceCm).toBe(-2);
    expect(chest(1, 'ellipse').differenceCm).toBe(1);
    expect(chest(0, 'anny').differenceCm).toBeNull(); // scan 2 Anny unavailable
    expect(chest(1, 'anny').differenceCm).toBe(1);
    expect(rep.summary.ellipse.chest).toEqual({ count: 2, meanAbsDifferenceCm: 1.5, medianAbsDifferenceCm: 1.5, maxAbsDifferenceCm: 2 });
    expect(rep.summary.anny.chest.count).toBe(1);
    // Thigh: ellipse unavailable in every scan → no difference.
    expect(rep.summary.ellipse.thigh).toMatchObject({ count: 0, meanAbsDifferenceCm: null });
  });

  it('needs at least two scans', () => {
    expect(subjectRepeatability(syntheticSubject([SYNTHETIC_ATTEMPT_1]))).toBeNull();
  });
});

describe('scan → validation attempt', () => {
  const captures = makeSilhouetteCaptures();
  const unavailable: AnnyShadowState = { status: 'unavailable', reason: 'not enough views' };

  it('records the production engine on the full body and keeps only numbers', () => {
    const report = measureForValidation(captures, BODY.statureCm);
    const attempt = buildScanAttempt({
      meta: { attempt: 1, clothingType: 'activewear', clothingFit: 'fitted', deviceType: 'phone', cameraType: 'rear', lighting: 'dim' },
      report,
      annyShadow: unavailable,
      captures,
      enteredHeightCm: BODY.statureCm,
      now: new Date('2026-02-01T10:00:00Z'),
    });
    const chest = report.measurements.find((m) => m.id === 'chest')!;
    expect(attempt.ellipse.chest).toEqual({ valueCm: chest.value, status: chest.status });
    expect([...attempt.viewsCaptured].sort()).toEqual(Object.keys(captures).sort());
    expect(attempt.timestamp).toBe('2026-02-01T10:00:00.000Z');
    for (const p of Object.values(attempt.anny)) expect(p).toMatchObject({ valueCm: null, status: 'unavailable' });
    expect(attempt.annyInfo).toMatchObject({ status: 'unavailable', reason: 'not enough views' });
    expect(() => assertExportSafe(attempt)).not.toThrow();
    expect(JSON.stringify(attempt)).not.toMatch(/landmark|silhouette|rows/i);
  });

  it('does not turn missing or model-unit engine values into numbers', () => {
    const report = measureForValidation(captures, null);
    const recorded = recordEllipse(report);
    for (const m of report.measurements) {
      const p = recorded[m.id as keyof typeof recorded];
      if (!p) continue;
      if (m.value === null || m.unit !== 'cm') expect(p.valueCm).toBeNull();
    }
  });

  it('records the Anny worker outcome (fit error, height error, worker time, views)', () => {
    const state: AnnyShadowState = {
      status: 'done',
      loadMs: 100.4,
      fitMs: 50.2,
      modelBytes: 1,
      result: {
        status: 'unavailable',
        reason: 'the body model could not match the outlines closely enough',
        fit: { iterations: 5, converged: true, rmsResidualCm: 3.5, heightErrorCm: -0.4, rowsUsed: 10, viewsUsed: ['front', 'left'] },
      },
    };
    const { predictions, info } = recordAnny(state);
    expect(info).toEqual({
      status: 'unavailable',
      reason: 'the body model could not match the outlines closely enough',
      rmsResidualCm: 3.5,
      heightErrorCm: -0.4,
      iterations: 5,
      workerMs: 151,
      viewsUsed: ['front', 'left'],
    });
    expect(Object.values(predictions).every((p) => p.valueCm === null)).toBe(true);
    expect(recordAnny({ status: 'running' }).info.status).toBe('not-run');
    expect(recordAnny({ status: 'error', message: 'boom' }).info).toMatchObject({ status: 'error', reason: 'boom' });
  });
});

describe('export (JSON / CSV)', () => {
  const subject = syntheticSubject([SYNTHETIC_ATTEMPT_1, SYNTHETIC_ATTEMPT_2]);
  const now = new Date('2026-03-01T00:00:00Z');

  it('JSON holds values, comparisons, metrics and repeatability — and the SYNTHETIC label', () => {
    const json = JSON.parse(toValidationJson([subject], now));
    expect(json.format).toBe('sizerai-validation-v1');
    expect(json.synthetic).toBe(true);
    expect(json.syntheticNotice).toBe(SYNTHETIC_NOTICE);
    expect(json.notice).toMatch(/not yet validated for real-world clothing sizing/);
    expect(json.subjects[0].attempts).toHaveLength(2);
    const chest = json.subjects[0].attempts[0].comparisons.find((c: { measurement: string }) => c.measurement === 'chest');
    expect(chest).toMatchObject({ tapeCm: 100, ellipse: { predictedCm: 104, absErrorCm: 4, signedErrorCm: 4, percentError: 4 } });
    const thigh = json.subjects[0].attempts[0].comparisons.find((c: { measurement: string }) => c.measurement === 'thigh');
    expect(thigh.ellipse).toMatchObject({ predictedCm: null, unavailable: true, absErrorCm: null });
    expect(json.summary.ellipse.overall).toMatchObject({ validComparisons: 12, unavailable: 2 });
    expect(json.repeatability[0].pairs[0]).toMatchObject({ baselineAttempt: 1, repeatAttempt: 2 });
  });

  it('CSV has one row per attempt × measurement, escapes text and flags SYNTHETIC data', () => {
    const notesSubject = {
      ...subject,
      groundTruth: subject.groundTruth.map((t) => (t.name === 'waist' ? { ...t, notes: '=SUM(A1), "loose" belt' } : t)),
    };
    const csv = toValidationCsv([notesSubject], now);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^# .*SYNTHETIC/);
    expect(lines[1]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(2 + 2 * 8);
    const waist = lines.find((l) => l.includes(',waist,'))!;
    expect(waist).toContain(`"'=SUM(A1), ""loose"" belt"`);
    const chest = lines[2].split(',');
    expect(chest[CSV_COLUMNS.indexOf('measurement')]).toBe('chest');
    expect(chest[CSV_COLUMNS.indexOf('ellipse_signed_error_cm')]).toBe('4');
    expect(chest[CSV_COLUMNS.indexOf('synthetic')]).toBe('true');
    expect(csvCell(null)).toBe('');
    expect(csvCell(-2)).toBe('-2');
  });
});

describe('privacy', () => {
  it('rejects camera data in an export', () => {
    expect(() => assertExportSafe({ landmarks: [] })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ a: { worldLandmarks: [] } })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ silhouette: {} })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ segmentationMask: 1 })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ frame: 1 })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ photo: 'x' })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ values: new Float32Array(4) })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ v: new ArrayBuffer(4) })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ v: 'data:image/png;base64,AAAA' })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ v: new Date() })).toThrow(/Privacy/);
    expect(() => assertExportSafe({ v: 'x'.repeat(5000) })).toThrow(/Privacy/);
  });

  it('exports only whitelisted fields even if a record carries extra data', () => {
    const attempt = { ...SYNTHETIC_ATTEMPT_1, captures: { front: { landmarks: [{ x: 0.5 }] } }, mask: new Float32Array(16) };
    const tainted = { ...syntheticSubject([attempt]), photo: 'data:image/jpeg;base64,AAAA' } as unknown as ValidationSubject;
    const json = toValidationJson([tainted]);
    expect(json).not.toMatch(/landmark|mask|photo|data:image|captures"/i);
    expect(() => buildExport([tainted])).not.toThrow();
  });

  it('labels synthetic data and keeps it out of real-only exports', () => {
    expect(syntheticSubject().synthetic).toBe(true);
    expect(syntheticAttempt(9, {}, null).anny.chest.reason).toContain(SYNTHETIC_LABEL);
    const real = { ...syntheticSubject(), subjectId: 'P-002', synthetic: false };
    const json = JSON.parse(toValidationJson([real]));
    expect(json.synthetic).toBe(false);
    expect(json.syntheticNotice).toBeUndefined();
  });
});
