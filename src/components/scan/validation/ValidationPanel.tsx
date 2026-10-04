import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { AnnyShadowState } from '../../../hooks/useAnnyShadow';
import { downloadTextFile } from '../../../services/download';
import { nextAttemptNumber, useValidationStore } from '../../../store/validationStore';
import type { ScanCapture, ScanViewId } from '../../../types/scan';
import type {
  ClothingFit,
  LightingCondition,
  ValidationCameraType,
  ValidationDeviceType,
  ValidationSubject,
  WornClothingType,
} from '../../../types/validation';
import { compareAttempt, SOURCE_LABELS, VALIDATION_SOURCES, type SourceComparison } from '../../../utils/validation/compare';
import {
  CAMERA_LABELS,
  CLOTHING_FIT_LABELS,
  DEVICE_LABELS,
  LIGHTING_LABELS,
  VALIDATION_LABELS,
  VALIDATION_MEASUREMENTS,
  WORN_CLOTHING_LABELS,
} from '../../../utils/validation/definitions';
import { toValidationCsv, toValidationJson } from '../../../utils/validation/export';
import { buildScanAttempt, measureForValidation, type ScanAttemptMeta } from '../../../utils/validation/fromScan';
import {
  emptyGroundTruthDraft,
  parseGroundTruthDraft,
  type GroundTruthDraft,
  type GroundTruthErrors,
} from '../../../utils/validation/groundTruth';
import { summarizeValidation, type ErrorSummary } from '../../../utils/validation/metrics';
import { subjectRepeatability } from '../../../utils/validation/repeatability';
import './ValidationPanel.css';

/*
 * Real-person validation (Step 9E-3A), shown only with `?poseDebug`: enter a subject's manual tape measurements,
 * record finished scans against them, and compare the current ellipse engine and the Anny shadow with the tape.
 * Records are kept in memory only; exports contain measurement values and metrics only.
 */

interface ValidationPanelProps {
  scanFinished: boolean;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  userHeightCm: number | null;
  annyShadow: AnnyShadowState;
}

const cm = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? '–' : value.toFixed(digits);
const signed = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? '–' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

export function ValidationPanel({ scanFinished, captures, userHeightCm, annyShadow }: ValidationPanelProps) {
  const subjects = useValidationStore((s) => s.subjects);
  const activeSubjectId = useValidationStore((s) => s.activeSubjectId);
  const active = subjects.find((s) => s.subjectId === activeSubjectId);

  return (
    <section className="validation" aria-labelledby="validation-title">
      <h2 id="validation-title" className="validation__title">
        Validation mode — experimental
      </h2>
      <p className="validation__notice">Ground truth must come from manual tape measurements.</p>
      <p className="validation__notice">These results are not yet validated for real-world clothing sizing.</p>
      <p className="validation__hint">
        Developer view only. Records stay in memory on this device (cleared on reload). No photos, camera frames or
        outlines are stored or exported — only measurement values and metrics.
      </p>

      <SubjectForm subjects={subjects} active={active} />
      {active && (
        <RecordScan subject={active} scanFinished={scanFinished} captures={captures} userHeightCm={userHeightCm} annyShadow={annyShadow} />
      )}
      {active && active.attempts.length > 0 && <AttemptResults subject={active} />}
      {active && <Repeatability subject={active} />}
      {subjects.some((s) => s.attempts.length > 0) && <Summary subjects={subjects} />}
      {subjects.length > 0 && <Export subjects={subjects} />}
    </section>
  );
}

function draftFromSubject(subject: ValidationSubject): GroundTruthDraft {
  return {
    subjectId: subject.subjectId,
    heightCm: String(subject.heightCm),
    values: Object.fromEntries(subject.groundTruth.map((t) => [t.name, String(t.value)])),
    notes: Object.fromEntries(subject.groundTruth.flatMap((t) => (t.notes ? [[t.name, t.notes]] : []))),
  };
}

function SubjectForm({ subjects, active }: { subjects: ValidationSubject[]; active: ValidationSubject | undefined }) {
  const saveSubject = useValidationStore((s) => s.saveSubject);
  const selectSubject = useValidationStore((s) => s.selectSubject);
  const [draft, setDraft] = useState<GroundTruthDraft>(() => (active ? draftFromSubject(active) : emptyGroundTruthDraft()));
  const [errors, setErrors] = useState<GroundTruthErrors>({});
  const [saved, setSaved] = useState(false);

  const update = (change: Partial<GroundTruthDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setSaved(false);
  };
  const choose = (subjectId: string) => {
    const subject = subjects.find((s) => s.subjectId === subjectId);
    selectSubject(subject ? subject.subjectId : null);
    setDraft(subject ? draftFromSubject(subject) : emptyGroundTruthDraft());
    setErrors({});
    setSaved(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseGroundTruthDraft(draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    saveSubject({ subjectId: parsed.subjectId, heightCm: parsed.heightCm, groundTruth: parsed.groundTruth });
    setSaved(true);
  };

  return (
    <form className="validation__block" onSubmit={submit} noValidate>
      <h3 className="validation__subtitle">Test subject and tape measurements</h3>
      {subjects.length > 0 && (
        <label className="validation__field">
          <span>Subject</span>
          <select value={active?.subjectId ?? ''} onChange={(e) => choose(e.target.value)}>
            <option value="">New subject…</option>
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.subjectId} ({s.attempts.length} scans)
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="validation__grid">
        <Field label="Anonymous subject ID" error={errors.subjectId}>
          {(props) => (
            <input
              {...props}
              value={draft.subjectId}
              placeholder="P-001"
              autoComplete="off"
              onChange={(e) => update({ subjectId: e.target.value })}
            />
          )}
        </Field>
        <Field label="Height (cm, tape)" error={errors.heightCm}>
          {(props) => <input {...props} inputMode="decimal" value={draft.heightCm} onChange={(e) => update({ heightCm: e.target.value })} />}
        </Field>
      </div>
      <p className="validation__hint">Enter only values measured with a tape. Leave a measurement empty if it wasn’t taken.</p>
      <div className="validation__tape">
        {VALIDATION_MEASUREMENTS.map((m) => (
          <div key={m.id} className="validation__tape-row">
            <Field label={`${m.label} (cm)`} error={errors[m.id]} hint={m.tapeHint}>
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={draft.values[m.id] ?? ''}
                  onChange={(e) => update({ values: { ...draft.values, [m.id]: e.target.value } })}
                />
              )}
            </Field>
            <Field label={`${m.label} notes (optional)`} error={errors[`${m.id}-notes`]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.notes[m.id] ?? ''}
                  autoComplete="off"
                  onChange={(e) => update({ notes: { ...draft.notes, [m.id]: e.target.value } })}
                />
              )}
            </Field>
          </div>
        ))}
      </div>
      <div className="validation__actions">
        <button type="submit" className="validation__button">
          Save subject
        </button>
        {saved && <span role="status">Saved {draft.subjectId.trim()}.</span>}
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

function Field({ label, error, hint, children }: FieldProps) {
  const id = `validation-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="validation__field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && (
        <small id={`${id}-hint`} className="validation__field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="validation__error">
          {error}
        </small>
      )}
    </div>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <label className="validation__field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(options) as T[]).map((key) => (
          <option key={key} value={key}>
            {options[key]}
          </option>
        ))}
      </select>
    </label>
  );
}

type MetaDraft = Omit<ScanAttemptMeta, 'attempt'>;

interface RecordScanProps {
  subject: ValidationSubject;
  scanFinished: boolean;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  userHeightCm: number | null;
  annyShadow: AnnyShadowState;
}

function RecordScan({ subject, scanFinished, captures, userHeightCm, annyShadow }: RecordScanProps) {
  const addAttempt = useValidationStore((s) => s.addAttempt);
  const [meta, setMeta] = useState<MetaDraft>({
    clothingType: 'activewear',
    clothingFit: 'fitted',
    deviceType: 'phone',
    cameraType: 'rear',
    lighting: 'normal-indoor',
  });
  // The captures already recorded (per subject), so one scan isn't recorded twice.
  const [recorded, setRecorded] = useState<{ captures: unknown; subjectId: string } | null>(null);
  const attempt = nextAttemptNumber(subject);
  const annySettled = annyShadow.status !== 'running' && annyShadow.status !== 'idle';
  const alreadyRecorded = recorded?.captures === captures && recorded.subjectId === subject.subjectId;
  const blocker = !scanFinished
    ? 'Finish the 360° scan first.'
    : !annySettled
      ? 'Waiting for the Anny shadow fit…'
      : alreadyRecorded
        ? 'This scan is already recorded. Scan again for the next attempt.'
        : null;
  const heightMismatch = userHeightCm !== null && Math.abs(userHeightCm - subject.heightCm) > 0.5;

  const record = () => {
    if (blocker) return;
    const report = measureForValidation(captures, userHeightCm);
    const added = addAttempt(
      subject.subjectId,
      buildScanAttempt({ meta: { ...meta, attempt }, report, annyShadow, captures, enteredHeightCm: userHeightCm }),
    );
    if (added) setRecorded({ captures, subjectId: subject.subjectId });
  };
  const set = <K extends keyof MetaDraft>(key: K) => (value: MetaDraft[K]) => setMeta((m) => ({ ...m, [key]: value }));

  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">
        Record scan {attempt} for {subject.subjectId}
      </h3>
      <div className="validation__grid">
        <Select<WornClothingType> label="Clothing worn" value={meta.clothingType} options={WORN_CLOTHING_LABELS} onChange={set('clothingType')} />
        <Select<ClothingFit> label="Clothing fit" value={meta.clothingFit} options={CLOTHING_FIT_LABELS} onChange={set('clothingFit')} />
        <Select<ValidationDeviceType> label="Device" value={meta.deviceType} options={DEVICE_LABELS} onChange={set('deviceType')} />
        <Select<ValidationCameraType> label="Camera" value={meta.cameraType} options={CAMERA_LABELS} onChange={set('cameraType')} />
        <Select<LightingCondition> label="Lighting" value={meta.lighting} options={LIGHTING_LABELS} onChange={set('lighting')} />
      </div>
      {heightMismatch && (
        <p className="validation__error">
          The height entered in the app ({cm(userHeightCm)} cm) differs from the subject’s tape height ({cm(subject.heightCm)} cm).
        </p>
      )}
      <div className="validation__actions">
        <button type="button" className="validation__button" onClick={record} disabled={Boolean(blocker)}>
          Record this scan
        </button>
        {blocker && <span>{blocker}</span>}
      </div>
    </div>
  );
}

function predictionCell(s: SourceComparison) {
  if (s.unavailable) return <span title={s.reason}>unavailable</span>;
  return (
    <>
      {cm(s.predictedCm)} <span className="validation__muted">({s.status})</span>
    </>
  );
}

function AttemptResults({ subject }: { subject: ValidationSubject }) {
  const sorted = [...subject.attempts].sort((a, b) => a.attempt - b.attempt);
  const [selected, setSelected] = useState<number | null>(null);
  const attempt = sorted.find((a) => a.attempt === selected) ?? sorted[sorted.length - 1];
  const rows = compareAttempt(subject, attempt);
  const info = attempt.annyInfo;

  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">Tape vs current ellipse vs Anny shadow</h3>
      <label className="validation__field validation__field--inline">
        <span>Scan</span>
        <select value={attempt.attempt} onChange={(e) => setSelected(Number(e.target.value))}>
          {sorted.map((a) => (
            <option key={a.attempt} value={a.attempt}>
              Scan {a.attempt}
            </option>
          ))}
        </select>
      </label>
      <dl className="validation__facts">
        <Fact label="Subject" value={subject.subjectId} />
        <Fact label="Scan number" value={String(attempt.attempt)} />
        <Fact label="Device" value={`${DEVICE_LABELS[attempt.deviceType]} · ${CAMERA_LABELS[attempt.cameraType]}`} />
        <Fact label="Clothing" value={`${WORN_CLOTHING_LABELS[attempt.clothingType]} · ${CLOTHING_FIT_LABELS[attempt.clothingFit]}`} />
        <Fact label="Lighting" value={LIGHTING_LABELS[attempt.lighting]} />
        <Fact label="Views" value={`${attempt.viewsCaptured.length} captured · Anny used ${info.viewsUsed.length}`} />
        <Fact label="Anny status" value={info.reason ? `${info.status} — ${info.reason}` : info.status} />
        <Fact label="Anny fit error" value={`${cm(info.rmsResidualCm)} cm RMS`} />
        <Fact label="Anny height error" value={`${signed(info.heightErrorCm)} cm`} />
        <Fact label="Anny worker time" value={info.workerMs === null ? '–' : `${info.workerMs} ms`} />
      </dl>
      <div className="validation__table-wrap">
        <table className="validation__table">
          <thead>
            <tr>
              <th scope="col">Measurement</th>
              <th scope="col">Tape cm</th>
              <th scope="col">Ellipse cm</th>
              <th scope="col">Ellipse error</th>
              <th scope="col">Anny cm</th>
              <th scope="col">Anny error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td>{row.truthCm === null ? 'not taped' : cm(row.truthCm)}</td>
                <td>{predictionCell(row.ellipse)}</td>
                <td>{errorCell(row.ellipse)}</td>
                <td>{predictionCell(row.anny)}</td>
                <td>{errorCell(row.anny)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="validation__hint">Error = scan − tape (cm): absolute, signed, and % of the tape value.</p>
    </div>
  );
}

function errorCell(s: SourceComparison) {
  if (!s.error) return '–';
  return `${cm(s.error.absCm)} (${signed(s.error.signedCm)}, ${s.error.percent.toFixed(1)}%)`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="validation__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SummaryRow({ label, s }: { label: string; s: ErrorSummary }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{s.count}</td>
      <td>{s.unavailable}</td>
      <td>{cm(s.maeCm)}</td>
      <td>{signed(s.biasCm)}</td>
      <td>{cm(s.medianAbsCm)}</td>
      <td>{cm(s.maxAbsCm)}</td>
    </tr>
  );
}

function Summary({ subjects }: { subjects: ValidationSubject[] }) {
  const summary = useMemo(() => summarizeValidation(subjects), [subjects]);
  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">
        Summary metrics ({summary.attempts} scans of {summary.subjects} subjects)
      </h3>
      {VALIDATION_SOURCES.map((source) => (
        <div key={source} className="validation__table-wrap">
          <table className="validation__table">
            <caption>{SOURCE_LABELS[source]}</caption>
            <thead>
              <tr>
                <th scope="col">Measurement</th>
                <th scope="col">Valid</th>
                <th scope="col">Unavailable</th>
                <th scope="col">MAE cm</th>
                <th scope="col">Bias cm</th>
                <th scope="col">Median abs cm</th>
                <th scope="col">Max abs cm</th>
              </tr>
            </thead>
            <tbody>
              <SummaryRow label="All" s={summary[source].overall} />
              {VALIDATION_MEASUREMENTS.map((m) => (
                <SummaryRow key={m.id} label={m.label} s={summary[source].byMeasurement[m.id]} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="validation__hint">Bias = mean of (scan − tape): positive means the scan measures larger.</p>
    </div>
  );
}

function Repeatability({ subject }: { subject: ValidationSubject }) {
  const rep = useMemo(() => subjectRepeatability(subject), [subject]);
  if (!rep) return null;
  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">Repeatability ({subject.subjectId})</h3>
      <p className="validation__hint">Differences between scans of the same subject — not errors; no scan is treated as ground truth.</p>
      <div className="validation__table-wrap">
        <table className="validation__table">
          <thead>
            <tr>
              <th scope="col">Measurement</th>
              {rep.pairs.flatMap((pair) =>
                VALIDATION_SOURCES.map((source) => (
                  <th key={`${pair.repeatAttempt}-${source}`} scope="col">
                    {source === 'ellipse' ? 'Ellipse' : 'Anny'} {pair.baselineAttempt}→{pair.repeatAttempt}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {VALIDATION_MEASUREMENTS.map((m) => (
              <tr key={m.id}>
                <th scope="row">{VALIDATION_LABELS[m.id]}</th>
                {rep.pairs.flatMap((pair) =>
                  VALIDATION_SOURCES.map((source) => (
                    <td key={`${pair.repeatAttempt}-${source}`}>{signed(pair[source].find((d) => d.id === m.id)?.differenceCm)}</td>
                  )),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Export({ subjects }: { subjects: ValidationSubject[] }) {
  const clearAll = useValidationStore((s) => s.clearAll);
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">Export (measurement values and metrics only)</h3>
      <div className="validation__actions">
        <button
          type="button"
          className="validation__button"
          onClick={() => downloadTextFile(`sizerai-validation-${stamp()}.json`, toValidationJson(subjects), 'application/json')}
        >
          Download JSON
        </button>
        <button
          type="button"
          className="validation__button"
          onClick={() => downloadTextFile(`sizerai-validation-${stamp()}.csv`, toValidationCsv(subjects), 'text/csv')}
        >
          Download CSV
        </button>
        <button type="button" className="validation__button validation__button--quiet" onClick={clearAll}>
          Clear validation data
        </button>
      </div>
    </div>
  );
}
