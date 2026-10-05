import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { AnnyShadowState } from '../../../hooks/useAnnyShadow';
import type { PoseStats } from '../../../hooks/usePoseScan';
import { downloadTextFile } from '../../../services/download';
import { nextAttemptNumber, useValidationStore } from '../../../store/validationStore';
import type { ScanCapture, ScanSessionStatus, ScanViewId } from '../../../types/scan';
import type {
  ClothingFit,
  LightingCondition,
  MeasuringSide,
  Observation,
  ValidationCameraType,
  ValidationDeviceType,
  ValidationMeasurementGroup,
  ValidationScanAttempt,
  ValidationSubject,
  WornClothingType,
} from '../../../types/validation';
import { browserSummary } from '../../../utils/validation/browser';
import { compareAttempt, SOURCE_LABELS, VALIDATION_SOURCES, type SourceComparison } from '../../../utils/validation/compare';
import {
  CAMERA_LABELS,
  CLOTHING_FIT_LABELS,
  DEVICE_LABELS,
  GENERAL_PROTOCOL,
  GROUP_LABELS,
  HEIGHT_PROTOCOL,
  LIGHTING_LABELS,
  MAX_DEVICE_DETAILS_LENGTH,
  PROTOCOL_DISCLAIMER,
  SCAN_PROCEDURE,
  SIDE_LABELS,
  VALIDATION_GROUPS,
  VALIDATION_LABELS,
  VALIDATION_MEASUREMENTS,
  WORN_CLOTHING_LABELS,
} from '../../../utils/validation/definitions';
import { ACCURACY_DISCLAIMER, REAL_WORLD_LABEL, toValidationCsv, toValidationJson } from '../../../utils/validation/export';
import {
  buildScanAttempt,
  firstToLastViewMs,
  measureForValidation,
  scanUsability,
  type ScanAttemptMeta,
} from '../../../utils/validation/fromScan';
import {
  emptyGroundTruthDraft,
  parseGroundTruthDraft,
  type GroundTruthDraft,
  type GroundTruthErrors,
  type SidedMeasurementId,
} from '../../../utils/validation/groundTruth';
import { annyReliability, summarizeValidation, type ErrorSummary } from '../../../utils/validation/metrics';
import { subjectRepeatability, type RepeatSummary } from '../../../utils/validation/repeatability';
import { useScanPerformance } from './useScanPerformance';
import './ValidationPanel.css';

/*
 * Real-person validation (Steps 9E-3A/9E-3B), shown only with `?poseDebug`: follow the tape protocol, enter a
 * subject's manual tape measurements, record each scan (unusable ones included, with the reason), and compare the
 * current ellipse engine and the Anny shadow with the tape. Records stay in memory; exports hold values and metrics
 * only. Nothing here changes the scan or the user-facing measurements.
 */

interface ValidationPanelProps {
  scanStatus: ScanSessionStatus;
  finishedEarly: boolean;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  userHeightCm: number | null;
  annyShadow: AnnyShadowState;
  /** Live pose-model timing, sampled for the device-performance record. */
  poseStats: PoseStats | null;
}

const num = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? '–' : value.toFixed(digits);
const signed = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? '–' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
const seconds = (ms: number | null | undefined) => (ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(1)} s`);
const millis = (ms: number | null | undefined) => (ms === null || ms === undefined ? '–' : `${Math.round(ms)} ms`);

export function ValidationPanel({ scanStatus, finishedEarly, captures, userHeightCm, annyShadow, poseStats }: ValidationPanelProps) {
  const subjects = useValidationStore((s) => s.subjects);
  const activeSubjectId = useValidationStore((s) => s.activeSubjectId);
  const active = subjects.find((s) => s.subjectId === activeSubjectId);
  const readPerformance = useScanPerformance(scanStatus, poseStats);
  const anyAttempts = subjects.some((s) => s.attempts.length > 0);

  return (
    <section className="validation" aria-labelledby="validation-title">
      <h2 id="validation-title" className="validation__title">
        Validation mode — experimental
      </h2>
      <p className="validation__badge">{REAL_WORLD_LABEL}</p>
      <p className="validation__notice">Ground truth must come from manual tape measurements.</p>
      <p className="validation__notice">These results are not yet validated for real-world clothing sizing.</p>
      <p className="validation__notice">{ACCURACY_DISCLAIMER}</p>
      <p className="validation__hint">
        Developer view only. Records stay in memory on this device (cleared on reload). No photos, video, camera frames,
        landmarks or outlines are stored or exported — only measurement values and metrics. Do not enter names, e-mail
        addresses, phone numbers or addresses.
      </p>

      <Protocol />
      <SubjectForm key={active?.subjectId ?? 'new'} subjects={subjects} active={active} />
      {active && (
        <RecordScan
          subject={active}
          scanStatus={scanStatus}
          finishedEarly={finishedEarly}
          captures={captures}
          userHeightCm={userHeightCm}
          annyShadow={annyShadow}
          readPerformance={readPerformance}
        />
      )}
      {anyAttempts && <ScanOverview subjects={subjects} />}
      {active && active.attempts.length > 0 && <AttemptResults subject={active} />}
      {anyAttempts && <Summary subjects={subjects} />}
      {active && <Repeatability subject={active} />}
      {subjects.length > 0 && <Export subjects={subjects} />}
    </section>
  );
}

function Protocol() {
  return (
    <div className="validation__block">
      <details className="validation__details">
        <summary>Measurement protocol (centimetres)</summary>
        <ul>
          {GENERAL_PROTOCOL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h4>Height</h4>
        <ul>
          {HEIGHT_PROTOCOL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {VALIDATION_MEASUREMENTS.map((m) => (
          <div key={m.id}>
            <h4>{m.label}</h4>
            <ul>
              {m.protocol.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="validation__notice">{PROTOCOL_DISCLAIMER}</p>
      </details>
      <details className="validation__details">
        <summary>Controlled scan procedure</summary>
        <ol>
          {SCAN_PROCEDURE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function draftFromSubject(subject: ValidationSubject): GroundTruthDraft {
  return {
    subjectId: subject.subjectId,
    heightCm: String(subject.heightCm),
    values: Object.fromEntries(subject.groundTruth.map((t) => [t.name, String(t.value)])),
    notes: Object.fromEntries(subject.groundTruth.flatMap((t) => (t.notes ? [[t.name, t.notes]] : []))),
    sides: { ...subject.sides },
  };
}

function SubjectForm({ subjects, active }: { subjects: ValidationSubject[]; active: ValidationSubject | undefined }) {
  const saveSubject = useValidationStore((s) => s.saveSubject);
  const selectSubject = useValidationStore((s) => s.selectSubject);
  const [draft, setDraft] = useState<GroundTruthDraft>(() => (active ? draftFromSubject(active) : emptyGroundTruthDraft()));
  const [errors, setErrors] = useState<GroundTruthErrors>({});
  const [saved, setSaved] = useState(false);
  const locked = Boolean(active && active.attempts.length > 0);

  const update = (change: Partial<GroundTruthDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setSaved(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) return;
    const parsed = parseGroundTruthDraft(draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    const conflict = subjects.find((s) => s.subjectId === parsed.subjectId && s.attempts.length > 0);
    if (conflict) {
      setErrors({ subjectId: 'This subject already has recorded scans; its tape values are fixed. Use a new ID.' });
      return;
    }
    setErrors({});
    setSaved(saveSubject({ subjectId: parsed.subjectId, heightCm: parsed.heightCm, groundTruth: parsed.groundTruth, sides: parsed.sides }));
  };

  return (
    <form className="validation__block" onSubmit={submit} noValidate>
      <h3 className="validation__subtitle">1. Test subject and tape measurements</h3>
      {subjects.length > 0 && (
        <label className="validation__field">
          <span>Subject</span>
          <select value={active?.subjectId ?? ''} onChange={(e) => selectSubject(e.target.value || null)}>
            <option value="">New subject…</option>
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.subjectId} ({s.attempts.length} scans)
              </option>
            ))}
          </select>
        </label>
      )}
      {locked && (
        <p className="validation__notice" role="note">
          Tape values are fixed: this subject has recorded scans, and repeated scans must use the same ground truth.
        </p>
      )}
      <fieldset className="validation__fieldset" disabled={locked}>
        <div className="validation__grid">
          <Field label="Anonymous subject ID" error={errors.subjectId}>
            {(props) => (
              <input {...props} value={draft.subjectId} placeholder="P-001" autoComplete="off" onChange={(e) => update({ subjectId: e.target.value })} />
            )}
          </Field>
          <Field label="Height (cm, tape)" error={errors.heightCm} hint={HEIGHT_PROTOCOL.join(' ')}>
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
              {m.sided && (
                <Field label={`${m.label} side`} error={errors[`${m.id as SidedMeasurementId}-side`]}>
                  {(props) => (
                    <select
                      {...props}
                      value={draft.sides[m.id as SidedMeasurementId] ?? ''}
                      onChange={(e) =>
                        update({ sides: { ...draft.sides, [m.id]: (e.target.value || undefined) as MeasuringSide | undefined } })
                      }
                    >
                      <option value="">Choose…</option>
                      {(Object.keys(SIDE_LABELS) as MeasuringSide[]).map((side) => (
                        <option key={side} value={side}>
                          {SIDE_LABELS[side]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              <Field label={`${m.label} notes${m.notesRequired ? ' (method, required)' : ' (optional)'}`} error={errors[`${m.id}-notes`]}>
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
      </fieldset>
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

const OBSERVATION_LABELS: Record<Observation, string> = { 'not-recorded': 'Not recorded', yes: 'Yes', no: 'No' };

interface RecordDraft extends Omit<ScanAttemptMeta, 'attempt' | 'browser'> {
  scanCompletedNormally: Observation;
  cameraResponsive: Observation;
  browserSlowOrFroze: Observation;
  unusableReason: string;
}

interface RecordScanProps {
  subject: ValidationSubject;
  scanStatus: ScanSessionStatus;
  finishedEarly: boolean;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  userHeightCm: number | null;
  annyShadow: AnnyShadowState;
  readPerformance: ReturnType<typeof useScanPerformance>;
}

function RecordScan({ subject, scanStatus, finishedEarly, captures, userHeightCm, annyShadow, readPerformance }: RecordScanProps) {
  const addAttempt = useValidationStore((s) => s.addAttempt);
  const [draft, setDraft] = useState<RecordDraft>({
    clothingType: 'activewear',
    clothingFit: 'fitted',
    deviceType: 'phone',
    cameraType: 'rear',
    lighting: 'normal-indoor',
    deviceDetails: '',
    scanCompletedNormally: 'not-recorded',
    cameraResponsive: 'not-recorded',
    browserSlowOrFroze: 'not-recorded',
    unusableReason: '',
  });
  // The captures already recorded (per subject), so one scan isn't recorded twice.
  const [recorded, setRecorded] = useState<{ captures: unknown; subjectId: string } | null>(null);
  const browser = useMemo(() => browserSummary(typeof navigator === 'undefined' ? '' : navigator.userAgent), []);
  const attempt = nextAttemptNumber(subject);
  const viewCount = Object.keys(captures).length;
  const usability = scanUsability({
    scanStatus,
    viewsCaptured: viewCount,
    enteredHeightCm: userHeightCm,
    tapeHeightCm: subject.heightCm,
    testerReason: draft.unusableReason,
  });
  const finished = scanStatus === 'finished';
  const annySettled = annyShadow.status !== 'running' && annyShadow.status !== 'idle';
  const alreadyRecorded = recorded?.captures === captures && recorded.subjectId === subject.subjectId;
  const blocker =
    scanStatus === 'ready'
      ? 'Start the 360° scan first.'
      : finished && usability.usable && !annySettled
        ? 'Waiting for the Anny shadow fit…'
        : alreadyRecorded
          ? 'This scan is already recorded. Restart the scan for the next attempt.'
          : (draft.deviceDetails ?? '').length > MAX_DEVICE_DETAILS_LENGTH
            ? `Keep device details under ${MAX_DEVICE_DETAILS_LENGTH} characters.`
            : null;

  const record = () => {
    if (blocker) return;
    const { scanCompletedNormally, cameraResponsive, browserSlowOrFroze, unusableReason, deviceDetails, ...meta } = draft;
    const measured = readPerformance();
    const added = addAttempt(
      subject.subjectId,
      buildScanAttempt({
        meta: { ...meta, attempt, browser, ...(deviceDetails?.trim() ? { deviceDetails: deviceDetails.trim() } : {}) },
        measure: () => measureForValidation(captures, userHeightCm),
        annyShadow,
        captures,
        scanStatus,
        finishedEarly,
        enteredHeightCm: userHeightCm,
        tapeHeightCm: subject.heightCm,
        testerUnusableReason: unusableReason,
        performance: {
          ...measured,
          firstToLastViewMs: firstToLastViewMs(captures),
          scanCompletedNormally,
          cameraResponsive,
          browserSlowOrFroze,
        },
      }),
    );
    if (added) {
      setRecorded({ captures, subjectId: subject.subjectId });
      setDraft((d) => ({ ...d, unusableReason: '' }));
    }
  };
  const set =
    <K extends keyof RecordDraft>(key: K) =>
    (value: RecordDraft[K]) =>
      setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">
        2. Record scan {attempt} for {subject.subjectId}
      </h3>
      <div className="validation__grid">
        <Select<WornClothingType> label="Clothing worn" value={draft.clothingType} options={WORN_CLOTHING_LABELS} onChange={set('clothingType')} />
        <Select<ClothingFit> label="Clothing fit" value={draft.clothingFit} options={CLOTHING_FIT_LABELS} onChange={set('clothingFit')} />
        <Select<ValidationDeviceType> label="Device" value={draft.deviceType} options={DEVICE_LABELS} onChange={set('deviceType')} />
        <Select<ValidationCameraType> label="Camera" value={draft.cameraType} options={CAMERA_LABELS} onChange={set('cameraType')} />
        <Select<LightingCondition> label="Lighting" value={draft.lighting} options={LIGHTING_LABELS} onChange={set('lighting')} />
        <Field label="Device model / details (optional)" hint={`Detected: ${browser}`}>
          {(props) => (
            <input
              {...props}
              value={draft.deviceDetails ?? ''}
              placeholder="e.g. Pixel 7, Chrome"
              autoComplete="off"
              onChange={(e) => set('deviceDetails')(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="validation__grid">
        <Select<Observation> label="Scan completed normally?" value={draft.scanCompletedNormally} options={OBSERVATION_LABELS} onChange={set('scanCompletedNormally')} />
        <Select<Observation> label="Camera stayed responsive?" value={draft.cameraResponsive} options={OBSERVATION_LABELS} onChange={set('cameraResponsive')} />
        <Select<Observation> label="Browser slow or froze?" value={draft.browserSlowOrFroze} options={OBSERVATION_LABELS} onChange={set('browserSlowOrFroze')} />
        <Field label="Mark unusable — reason (optional)" hint="e.g. another person in view, subject moved during capture">
          {(props) => <input {...props} value={draft.unusableReason} autoComplete="off" onChange={(e) => set('unusableReason')(e.target.value)} />}
        </Field>
      </div>
      {scanStatus !== 'ready' && (
        <p className={usability.usable ? 'validation__hint' : 'validation__error'}>
          {usability.usable
            ? `Usable scan: ${viewCount} views${finishedEarly ? ' (finished early)' : ''}.`
            : `Will be recorded as unusable: ${usability.reason}. Its measurements are not recorded.`}
        </p>
      )}
      <div className="validation__actions">
        <button type="button" className="validation__button" onClick={record} disabled={Boolean(blocker)}>
          {usability.usable || scanStatus === 'ready' ? 'Record this scan' : 'Record as unusable attempt'}
        </button>
        {blocker && <span>{blocker}</span>}
      </div>
    </div>
  );
}

function ScanOverview({ subjects }: { subjects: ValidationSubject[] }) {
  const rows = subjects.flatMap((s) => [...s.attempts].sort((a, b) => a.attempt - b.attempt).map((a) => ({ subject: s, a })));
  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">3. All recorded scans</h3>
      <div className="validation__table-wrap">
        <table className="validation__table" aria-label="All recorded scans">
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Scan</th>
              <th scope="col">Usable</th>
              <th scope="col">Device</th>
              <th scope="col">Clothing</th>
              <th scope="col">Views</th>
              <th scope="col">Anny</th>
              <th scope="col">Fit error</th>
              <th scope="col">Height error</th>
              <th scope="col">Iterations</th>
              <th scope="col">Worker (load + fit)</th>
              <th scope="col">Scan time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ subject, a }) => (
              <tr key={`${subject.subjectId}-${a.attempt}`}>
                <th scope="row">{subject.subjectId}</th>
                <td>{a.attempt}</td>
                <td title={a.unusableReason}>{a.usable ? 'yes' : `no — ${a.unusableReason ?? ''}`}</td>
                <td>{`${DEVICE_LABELS[a.deviceType]} · ${CAMERA_LABELS[a.cameraType]}${a.deviceDetails ? ` · ${a.deviceDetails}` : ''}`}</td>
                <td>{`${WORN_CLOTHING_LABELS[a.clothingType]} · ${CLOTHING_FIT_LABELS[a.clothingFit]}`}</td>
                <td>{`${a.viewsCaptured.length} (Anny ${a.annyInfo.viewsUsed.length})`}</td>
                <td title={a.annyInfo.reason}>{a.annyInfo.reason ? `${a.annyInfo.status} — ${a.annyInfo.reason}` : a.annyInfo.status}</td>
                <td>{a.annyInfo.rmsResidualCm === null ? '–' : `${num(a.annyInfo.rmsResidualCm)} cm`}</td>
                <td>{a.annyInfo.heightErrorCm === null ? '–' : `${signed(a.annyInfo.heightErrorCm)} cm`}</td>
                <td>{a.annyInfo.iterations ?? '–'}</td>
                <td>{a.annyInfo.workerMs === null ? '–' : `${millis(a.annyInfo.workerMs)} (${millis(a.annyInfo.modelLoadMs)} + ${millis(a.annyInfo.fitMs)})`}</td>
                <td>{seconds(a.performance.scanDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function predictionCell(s: SourceComparison) {
  if (s.unavailable) return <span title={s.reason}>unavailable</span>;
  return (
    <>
      {num(s.predictedCm)} <span className="validation__muted">({s.status})</span>
    </>
  );
}

function errorCell(s: SourceComparison) {
  if (!s.error) return '–';
  return `${num(s.error.absCm)} (${signed(s.error.signedCm)}, ${s.error.percent.toFixed(1)}%)`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="validation__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function attemptFacts(subject: ValidationSubject, attempt: ValidationScanAttempt) {
  const info = attempt.annyInfo;
  const p = attempt.performance;
  return (
    <dl className="validation__facts">
      <Fact label="Subject" value={subject.subjectId} />
      <Fact label="Scan number" value={String(attempt.attempt)} />
      <Fact label="Usable" value={attempt.usable ? 'yes' : `no — ${attempt.unusableReason ?? ''}`} />
      <Fact label="Device" value={`${DEVICE_LABELS[attempt.deviceType]} · ${CAMERA_LABELS[attempt.cameraType]} · ${attempt.browser}${attempt.deviceDetails ? ` · ${attempt.deviceDetails}` : ''}`} />
      <Fact label="Clothing" value={`${WORN_CLOTHING_LABELS[attempt.clothingType]} · ${CLOTHING_FIT_LABELS[attempt.clothingFit]}`} />
      <Fact label="Lighting" value={LIGHTING_LABELS[attempt.lighting]} />
      <Fact label="Views" value={`${attempt.viewsCaptured.length} captured${attempt.finishedEarly ? ' (finished early)' : ''} · Anny used ${info.viewsUsed.length}`} />
      <Fact label="Anny status" value={info.reason ? `${info.status} — ${info.reason}` : info.status} />
      <Fact label="Anny fit error" value={info.rmsResidualCm === null ? '–' : `${num(info.rmsResidualCm)} cm RMS`} />
      <Fact label="Anny height error" value={info.heightErrorCm === null ? '–' : `${signed(info.heightErrorCm)} cm`} />
      <Fact label="Anny iterations" value={info.iterations === null ? '–' : String(info.iterations)} />
      <Fact label="Anny worker time" value={info.workerMs === null ? '–' : `${millis(info.workerMs)} (model ${millis(info.modelLoadMs)}, fit ${millis(info.fitMs)})`} />
      <Fact label="Scan time" value={`${seconds(p.scanDurationMs)} (first → last view ${seconds(p.firstToLastViewMs)})`} />
      <Fact label="Pose model" value={`${num(p.meanDetectionsPerSecond)} runs/s (lowest ${num(p.minDetectionsPerSecond, 0)}), ${num(p.meanInferenceMs)} ms/frame`} />
      <Fact
        label="Tester observed"
        value={`completed normally: ${p.scanCompletedNormally} · camera responsive: ${p.cameraResponsive} · slow/froze: ${p.browserSlowOrFroze}`}
      />
    </dl>
  );
}

function AttemptResults({ subject }: { subject: ValidationSubject }) {
  const sorted = [...subject.attempts].sort((a, b) => a.attempt - b.attempt);
  const [selected, setSelected] = useState<number | null>(null);
  const attempt = sorted.find((a) => a.attempt === selected) ?? sorted[sorted.length - 1];
  const rows = compareAttempt(subject, attempt);

  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">4. Tape vs current ellipse vs Anny shadow ({subject.subjectId})</h3>
      <label className="validation__field validation__field--inline">
        <span>Scan</span>
        <select value={attempt.attempt} onChange={(e) => setSelected(Number(e.target.value))}>
          {sorted.map((a) => (
            <option key={a.attempt} value={a.attempt}>
              Scan {a.attempt}
              {a.usable ? '' : ' (unusable)'}
            </option>
          ))}
        </select>
      </label>
      {attemptFacts(subject, attempt)}
      <div className="validation__table-wrap">
        <table className="validation__table" aria-label={`Scan ${attempt.attempt} comparison`}>
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
          {VALIDATION_GROUPS.map((group) => (
            <tbody key={group}>
              <tr className="validation__group-row">
                <th scope="rowgroup" colSpan={6}>
                  {GROUP_LABELS[group]}
                </th>
              </tr>
              {rows
                .filter((row) => VALIDATION_MEASUREMENTS.find((m) => m.id === row.id)?.group === group)
                .map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {row.truthCm === null ? 'not taped' : num(row.truthCm)}
                      {row.id === 'thigh' || row.id === 'arm-length' ? ` ${subject.sides[row.id] ? `(${subject.sides[row.id]})` : ''}` : ''}
                    </td>
                    <td>{predictionCell(row.ellipse)}</td>
                    <td>{errorCell(row.ellipse)}</td>
                    <td>{predictionCell(row.anny)}</td>
                    <td>{errorCell(row.anny)}</td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="validation__hint">Error = scan − tape (cm): absolute, signed, and % of the tape value.</p>
    </div>
  );
}

function SummaryRow({ label, s, strong }: { label: string; s: ErrorSummary; strong?: boolean }) {
  return (
    <tr className={strong ? 'validation__group-row' : undefined}>
      <th scope="row">{label}</th>
      <td>{s.count}</td>
      <td>{s.unavailable}</td>
      <td>{num(s.maeCm)}</td>
      <td>{signed(s.biasCm)}</td>
      <td>{num(s.medianAbsCm)}</td>
      <td>{num(s.maxAbsCm)}</td>
    </tr>
  );
}

function groupMeasurements(group: ValidationMeasurementGroup) {
  return VALIDATION_MEASUREMENTS.filter((m) => m.group === group);
}

function Summary({ subjects }: { subjects: ValidationSubject[] }) {
  const summary = useMemo(() => summarizeValidation(subjects), [subjects]);
  const anny = useMemo(() => annyReliability(subjects), [subjects]);
  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">5. Validation summary</h3>
      <p className="validation__badge">{REAL_WORLD_LABEL}</p>
      <p className="validation__notice">{ACCURACY_DISCLAIMER}</p>
      <p>
        {summary.subjectsWithUsableScans} of {summary.subjects} subjects with usable scans · {summary.usableAttempts} usable
        scans · {summary.unusableAttempts} unusable scans
      </p>
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
            {VALIDATION_GROUPS.map((group) => (
              <tbody key={group}>
                <SummaryRow label={`${GROUP_LABELS[group]} (pooled)`} s={summary[source].byGroup[group]} strong />
                {groupMeasurements(group).map((m) => (
                  <SummaryRow key={m.id} label={m.label} s={summary[source].byMeasurement[m.id]} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ))}
      <p className="validation__hint">
        Bias = mean of (scan − tape): positive means the scan measures larger. Circumferences and lengths are kept apart;
        there is no single combined accuracy figure. Only usable scans count.
      </p>
      <h4 className="validation__subtitle">Anny reliability (usable scans)</h4>
      <dl className="validation__facts">
        <Fact label="Results" value={`${anny.ok} of ${anny.scans} available · ${anny.unavailable} rejected/unavailable · ${anny.error} errors · ${anny.notRun} not run`} />
        <Fact label="Rejection rate" value={anny.rejectionRate === null ? '–' : `${Math.round(anny.rejectionRate * 100)}%`} />
        <Fact label="Mean fit error" value={anny.meanFitErrorCm === null ? '–' : `${num(anny.meanFitErrorCm)} cm`} />
        <Fact label="Mean |height error|" value={anny.meanAbsHeightErrorCm === null ? '–' : `${num(anny.meanAbsHeightErrorCm)} cm`} />
        <Fact label="Mean worker time" value={millis(anny.meanWorkerMs)} />
        {anny.reasons.map((r) => (
          <Fact key={r.reason} label={`× ${r.count}`} value={r.reason} />
        ))}
      </dl>
      <p className="validation__hint">A passing Anny fit does not mean its measurements are accurate.</p>
    </div>
  );
}

function RepeatCells({ s }: { s: RepeatSummary }) {
  return (
    <>
      <td>{num(s.meanAbsDifferenceCm)}</td>
      <td>{num(s.medianAbsDifferenceCm)}</td>
      <td>{num(s.maxAbsDifferenceCm)}</td>
    </>
  );
}

function Repeatability({ subject }: { subject: ValidationSubject }) {
  const rep = useMemo(() => subjectRepeatability(subject), [subject]);
  if (!rep) {
    return subject.attempts.length > 0 ? (
      <div className="validation__block">
        <h3 className="validation__subtitle">6. Repeatability ({subject.subjectId})</h3>
        <p className="validation__hint">Needs at least two usable scans of this subject. Restart the scan and record it again.</p>
      </div>
    ) : null;
  }
  return (
    <div className="validation__block">
      <h3 className="validation__subtitle">6. Repeatability ({subject.subjectId})</h3>
      <p className="validation__hint">
        Differences between usable scans of the same subject (scan {rep.pairs[0].baselineAttempt} vs each later scan) — separate
        from accuracy; no scan is treated as ground truth.
      </p>
      <div className="validation__table-wrap">
        <table className="validation__table" aria-label="Repeatability summary">
          <thead>
            <tr>
              <th scope="col">Measurement</th>
              <th scope="col">Ellipse mean |Δ|</th>
              <th scope="col">median |Δ|</th>
              <th scope="col">max |Δ|</th>
              <th scope="col">Anny mean |Δ|</th>
              <th scope="col">median |Δ|</th>
              <th scope="col">max |Δ|</th>
            </tr>
          </thead>
          <tbody>
            {VALIDATION_MEASUREMENTS.map((m) => (
              <tr key={m.id}>
                <th scope="row">{VALIDATION_LABELS[m.id]}</th>
                <RepeatCells s={rep.summary.ellipse[m.id]} />
                <RepeatCells s={rep.summary.anny[m.id]} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="validation__table-wrap">
        <table className="validation__table" aria-label="Scan-to-scan differences">
          <thead>
            <tr>
              <th scope="col">Δ cm</th>
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
      <h3 className="validation__subtitle">7. Export (measurement values and metrics only)</h3>
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
