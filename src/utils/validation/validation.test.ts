import { describe, expect, it } from 'vitest';
import type { AnnyShadowState } from '../../hooks/useAnnyShadow';
import type { ValidationSubject } from '../../types/validation';
import { makeSilhouetteCaptures } from '../measurement/testFixtures';
import { BODY } from '../silhouette/testBody';
import { compareAttempt, predictionError } from './compare';
import { assertExportSafe, buildExport, csvCell, CSV_COLUMNS, SYNTHETIC_NOTICE, toValidationCsv, toValidationJson } from './export';
import { browserSummary } from './browser';
import { buildScanAttempt, firstToLastViewMs, measureForValidation, recordAnny, recordEllipse, scanUsability } from './fromScan';
import { useValidationStore } from '../../store/validationStore';
import { emptyGroundTruthDraft, parseGroundTruthDraft, validateGroundTruth, type GroundTruthDraft } from './groundTruth';
import { annyReliability, summarizeErrors, summarizeValidation } from './metrics';
import { subjectRepeatability } from './repeatability';
import {
  SYNTHETIC_ATTEMPT_1,
  SYNTHETIC_ATTEMPT_2,
  SYNTHETIC_ATTEMPT_3,
  SYNTHETIC_LABEL,
  syntheticAttempt,
  syntheticSubject,
  syntheticUnusableAttempt,
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
      sides: {},
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
    // Circumferences and lengths are pooled separately — never one combined figure.
    expect(summary.ellipse.byGroup.circumference).toMatchObject({ count: 6, unavailable: 2, maeCm: 2, maxAbsCm: 4 });
    expect(summary.ellipse.byGroup.circumference.biasCm).toBeCloseTo(4 / 6, 10);
    expect(summary.ellipse.byGroup.length).toMatchObject({ count: 6, unavailable: 0, maeCm: 2, biasCm: 0, maxAbsCm: 3 });
    expect(summary).not.toHaveProperty('ellipse.overall');
    expect(summary.ellipse.byMeasurement.chest).toMatchObject({ count: 2, maeCm: 3, biasCm: 3, medianAbsCm: 3, maxAbsCm: 4 });
    expect(summary.ellipse.byMeasurement.thigh).toMatchObject({ count: 0, unavailable: 2, maeCm: null });
    expect(summary.ellipse.byMeasurement['leg-length']).toMatchObject({ count: 0, unavailable: 0 });
    // Anny: attempt 1 all 7 taped available (errors −2 +1 −1 −1 −1 0 +1), attempt 2 fit rejected.
    expect(summary.anny.byGroup.circumference).toMatchObject({ count: 4, unavailable: 4, maeCm: 1.25, biasCm: -0.75, maxAbsCm: 2 });
    expect(summary.anny.byGroup.length).toMatchObject({ count: 3, unavailable: 3, maeCm: 2 / 3, biasCm: 0, medianAbsCm: 1 });
    expect(summary.includesSynthetic).toBe(true);
    expect(summary.usableAttempts).toBe(2);
    expect(summary.unusableAttempts).toBe(0);
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

const META = {
  clothingType: 'activewear',
  clothingFit: 'fitted',
  deviceType: 'phone',
  cameraType: 'rear',
  lighting: 'dim',
  browser: 'Chrome 129 · Android',
} as const;
const PERFORMANCE = {
  scanDurationMs: null,
  firstToLastViewMs: null,
  meanDetectionsPerSecond: null,
  minDetectionsPerSecond: null,
  meanInferenceMs: null,
  scanCompletedNormally: 'not-recorded',
  cameraResponsive: 'not-recorded',
  browserSlowOrFroze: 'not-recorded',
} as const;

describe('scan → validation attempt', () => {
  const captures = makeSilhouetteCaptures();
  const unavailable: AnnyShadowState = { status: 'unavailable', reason: 'not enough views' };

  it('records the production engine on the full body and keeps only numbers', () => {
    const report = measureForValidation(captures, BODY.statureCm);
    const attempt = buildScanAttempt({
      meta: { ...META, attempt: 1 },
      measure: () => report,
      annyShadow: unavailable,
      captures,
      scanStatus: 'finished',
      finishedEarly: false,
      enteredHeightCm: BODY.statureCm,
      tapeHeightCm: BODY.statureCm,
      performance: PERFORMANCE,
      now: new Date('2026-02-01T10:00:00Z'),
    });
    const chest = report.measurements.find((m) => m.id === 'chest')!;
    expect(attempt.ellipse.chest).toEqual({ valueCm: chest.value, status: chest.status });
    expect([...attempt.viewsCaptured].sort()).toEqual(Object.keys(captures).sort());
    expect(attempt.timestamp).toBe('2026-02-01T10:00:00.000Z');
    for (const p of Object.values(attempt.anny)) expect(p).toMatchObject({ valueCm: null, status: 'unavailable' });
    expect(attempt.annyInfo).toMatchObject({ status: 'unavailable', reason: 'not enough views' });
    expect(attempt).toMatchObject({ usable: true, scanStatus: 'finished', browser: 'Chrome 129 · Android' });
    expect(() => assertExportSafe(attempt)).not.toThrow();
    expect(JSON.stringify(attempt)).not.toMatch(/landmark|silhouette|"rows"/i);
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
      modelLoadMs: 100,
      fitMs: 50,
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
    expect(json.summary.ellipse.byGroup.circumference).toMatchObject({ validComparisons: 6, unavailable: 2 });
    expect(json.summary.ellipse.byGroup.length).toMatchObject({ validComparisons: 6, unavailable: 0 });
    expect(json.summary.annyReliability).toMatchObject({ scans: 2, ok: 1, unavailable: 1, rejectionRate: 0.5 });
    expect(json.notice).toContain('REAL-WORLD VALIDATION — EXPERIMENTAL');
    expect(json.notice).toContain('These results do not yet establish production clothing-size accuracy.');
    expect(json.subjects[0].attempts[0]).toMatchObject({ usable: true, performance: { scanDurationMs: 60000 } });
    expect(json.subjects[0].sides).toEqual({ thigh: 'right', armLength: 'right' });
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

describe('Step 9E-3B: protocol rules', () => {
  it('requires the side for thigh and arm length, and the method notes for shoulder width and leg length', () => {
    const parsed = parseGroundTruthDraft(draft({ values: { thigh: '55', 'arm-length': '60', 'shoulder-width': '40', 'leg-length': '90' } }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.errors).sort()).toEqual(['arm-length-side', 'leg-length-notes', 'shoulder-width-notes', 'thigh-side']);
    const ok = parseGroundTruthDraft(
      draft({
        values: { thigh: '55', 'arm-length': '60', 'shoulder-width': '40', 'leg-length': '90' },
        sides: { thigh: 'left', 'arm-length': 'right' },
        notes: { 'shoulder-width': 'acromion to acromion', 'leg-length': 'trochanter to malleolus' },
      }),
    );
    expect(ok.ok && ok.sides).toEqual({ thigh: 'left', 'arm-length': 'right' });
  });

  it('fixes the ground truth once a scan is recorded and never overwrites attempts', () => {
    const store = useValidationStore.getState();
    store.clearAll();
    const subject = { subjectId: 'P-001', heightCm: 175, groundTruth: [{ name: 'chest' as const, value: 96, unit: 'cm' as const }], sides: {} };
    expect(store.saveSubject(subject)).toBe(true);
    expect(store.saveSubject({ ...subject, heightCm: 176 })).toBe(true); // no scans yet: correction allowed
    expect(useValidationStore.getState().addAttempt('P-001', SYNTHETIC_ATTEMPT_1)).toBe(true);
    expect(useValidationStore.getState().addAttempt('P-001', SYNTHETIC_ATTEMPT_3)).toBe(true);
    expect(useValidationStore.getState().addAttempt('P-001', { ...SYNTHETIC_ATTEMPT_1, usable: false })).toBe(false);
    expect(useValidationStore.getState().saveSubject({ ...subject, groundTruth: [{ name: 'chest', value: 90, unit: 'cm' }] })).toBe(false);
    const saved = useValidationStore.getState().subjects[0];
    expect(saved.groundTruth[0].value).toBe(96);
    expect(saved.attempts.map((a) => a.attempt)).toEqual([1, 3]);
    expect(saved.attempts[0].usable).toBe(true);
    store.clearAll();
  });
});

describe('Step 9E-3B: unusable scans', () => {
  it('decides usability: unfinished scan, missing or mismatched height, tester verdict', () => {
    const base = { scanStatus: 'finished' as const, viewsCaptured: 8, enteredHeightCm: 175, tapeHeightCm: 175 };
    expect(scanUsability(base)).toEqual({ usable: true });
    expect(scanUsability({ ...base, scanStatus: 'scanning', viewsCaptured: 3 })).toEqual({
      usable: false,
      reason: 'scan not finished (3 of 8 views captured)',
    });
    expect(scanUsability({ ...base, enteredHeightCm: null })).toMatchObject({ usable: false, reason: 'no height entered in the app' });
    expect(scanUsability({ ...base, enteredHeightCm: 172 })).toMatchObject({ usable: false, reason: expect.stringMatching(/differs from the tape height/) });
    expect(scanUsability({ ...base, enteredHeightCm: 175.8 })).toEqual({ usable: true });
    expect(scanUsability({ ...base, testerReason: 'second person in view' })).toMatchObject({
      usable: false,
      reason: 'marked unusable by the tester: second person in view',
    });
  });

  it('records an unusable scan without measuring it — no values from either engine', () => {
    const captures = makeSilhouetteCaptures();
    let measured = false;
    const done: AnnyShadowState = {
      status: 'done',
      loadMs: 10,
      fitMs: 5,
      modelBytes: 1,
      result: { status: 'ok', confidence: 'experimental', measurements: [], fit: { iterations: 4, converged: true, rmsResidualCm: 0.5, heightErrorCm: 0, rowsUsed: 9, viewsUsed: ['front'] } },
    };
    const attempt = buildScanAttempt({
      meta: { ...META, attempt: 2 },
      measure: () => {
        measured = true;
        return measureForValidation(captures, 175);
      },
      annyShadow: done,
      captures,
      scanStatus: 'finished',
      finishedEarly: false,
      enteredHeightCm: 170,
      tapeHeightCm: 175,
      performance: PERFORMANCE,
    });
    expect(measured).toBe(false);
    expect(attempt.usable).toBe(false);
    expect(attempt.unusableReason).toMatch(/differs from the tape height/);
    for (const p of [...Object.values(attempt.ellipse), ...Object.values(attempt.anny)]) expect(p.valueCm).toBeNull();
  });

  it('an unfinished scan never uses an Anny result', () => {
    const attempt = buildScanAttempt({
      meta: { ...META, attempt: 1 },
      measure: () => measureForValidation({}, 175),
      annyShadow: { status: 'unavailable', reason: 'x' },
      captures: {},
      scanStatus: 'paused',
      finishedEarly: false,
      enteredHeightCm: 175,
      tapeHeightCm: 175,
      performance: PERFORMANCE,
    });
    expect(attempt).toMatchObject({ usable: false, scanStatus: 'paused', annyInfo: { status: 'not-run' } });
  });

  it('leaves unusable scans out of metrics and repeatability, but counts them', () => {
    const subject = syntheticSubject([SYNTHETIC_ATTEMPT_1, syntheticUnusableAttempt(2), SYNTHETIC_ATTEMPT_3]);
    const summary = summarizeValidation([subject]);
    expect(summary).toMatchObject({ usableAttempts: 2, unusableAttempts: 1, subjectsWithUsableScans: 1 });
    const onlyUsable = summarizeValidation([syntheticSubject([SYNTHETIC_ATTEMPT_1, SYNTHETIC_ATTEMPT_3])]);
    expect(summary.ellipse).toEqual(onlyUsable.ellipse);
    const rep = subjectRepeatability(subject)!;
    expect(rep.pairs.map((p) => p.repeatAttempt)).toEqual([3]);
    expect(subjectRepeatability(syntheticSubject([SYNTHETIC_ATTEMPT_1, syntheticUnusableAttempt(2)]))).toBeNull();
    const csv = toValidationCsv([subject]);
    expect(csv).toContain('SYNTHETIC: scan not finished');
  });
});

describe('Step 9E-3B: Anny reliability and device info', () => {
  it('reports availability, rejection reasons, fit and height error, worker time over usable scans', () => {
    const r = annyReliability([syntheticSubject([SYNTHETIC_ATTEMPT_1, SYNTHETIC_ATTEMPT_2, syntheticUnusableAttempt(4)])]);
    expect(r).toMatchObject({ scans: 2, ok: 1, unavailable: 1, error: 0, notRun: 0, rejectionRate: 0.5, meanWorkerMs: 120 });
    expect(r.reasons).toEqual([{ reason: `${SYNTHETIC_LABEL}: fit rejected`, count: 1 }]);
    expect(r.meanFitErrorCm).toBeCloseTo((0.8 + 3.5) / 2, 10);
    expect(r.meanAbsHeightErrorCm).toBeCloseTo((0.2 + 2.4) / 2, 10);
    expect(annyReliability([]).rejectionRate).toBeNull();
  });

  it('summarizes the browser from the user agent (never the full string)', () => {
    expect(
      browserSummary('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'),
    ).toBe('Chrome 129 · Android');
    expect(
      browserSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'),
    ).toBe('Safari 17 · iOS');
    expect(browserSummary('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36')).toBe(
      'Samsung Internet 25 · Android',
    );
    expect(browserSummary('')).toBe('unknown browser · unknown platform');
  });

  it('measures first → last view time from capture timestamps', () => {
    const captures = makeSilhouetteCaptures();
    const times = Object.values(captures).map((c) => c!.capturedAt);
    expect(firstToLastViewMs(captures)).toBe(Math.max(...times) - Math.min(...times));
    expect(firstToLastViewMs({})).toBeNull();
  });
});
