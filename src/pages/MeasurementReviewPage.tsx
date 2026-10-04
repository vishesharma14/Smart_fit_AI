import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, CircleCheck, Info, PencilLine, ScanLine, X } from 'lucide-react';
import { Button } from '../components/Button';
import { FormCard } from '../components/form/FormCard';
import { FormField } from '../components/form/FormField';
import { TextInput } from '../components/form/TextInput';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowStepForm, FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ConfirmedMeasurements, ReviewedMeasurement, ScanMeasurementResult } from '../types/measurement';
import { getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import {
  applyDrafts,
  confidenceLevel,
  confirmMeasurements,
  draftFor,
  initialReview,
  isEditable,
  STATUS_LABELS,
  type DraftValues,
} from '../utils/measurement/review';
import { fadeUpItem } from '../utils/motion';
import './MeasurementReviewPage.css';

const TITLE_ID = 'measurements-title';
const REGION_LABELS = { full: 'Full body', upper: 'Upper body', lower: 'Lower body' } as const;

/** Step 4 of the fit flow: review, optionally correct, and confirm the measurements from the scan. */
export function MeasurementReviewPage() {
  useDocumentTitle(pageTitle('Your measurements'));
  const result = useAppStore((s) => s.scanMeasurements);
  const confirmed = useAppStore((s) => s.measurements);
  const setMeasurements = useAppStore((s) => s.setMeasurements);

  return (
    <FlowStepLayout
      step={4}
      stepLabel="Measurements"
      titleId={TITLE_ID}
      title={
        <>
          Your <span className="flow-step__title-accent">measurements</span>
        </>
      }
      lead="Calculated on this device from the joint positions and body outline captured in your scan. Check them, correct any you know, then confirm."
      introExtra={
        <p className="measure-review__disclaimer">
          <Info aria-hidden="true" size={18} strokeWidth={1.75} />
          <span>
            Camera-based measurements are estimates. For best results, wear fitted clothing, keep your full body
            visible, and follow the scan guidance. These are not tailor or medical measurements. Each one shows how confident the
            scan is, and measurements the scan can’t provide are marked unavailable rather than guessed. Circumferences and
            inseam come from your body outline and stay marked uncertain until they have been checked against tape
            measurements.
          </span>
        </p>
      }
    >
      {result ? (
        // A new scan result starts a fresh review.
        <Review key={result.measuredAt} result={result} confirmed={confirmed} onConfirm={setMeasurements} />
      ) : (
        <NoResults />
      )}
    </FlowStepLayout>
  );
}

function NoResults() {
  return (
    <FlowStepForm titleId={TITLE_ID} onSubmit={(event) => event.preventDefault()}>
      <FormCard titleId="measurements-empty" title="No scan results yet">
        <p className="measure-review__empty">
          Complete the guided 360° body scan first. Your measurements are calculated from that scan.
        </p>
        <Button to={PATHS.scan} size="lg">
          <ScanLine aria-hidden="true" size={20} />
          Go to body scan
        </Button>
      </FormCard>
    </FlowStepForm>
  );
}

interface ReviewProps {
  result: ScanMeasurementResult;
  confirmed: ConfirmedMeasurements | null;
  onConfirm: (measurements: ConfirmedMeasurements) => void;
}

function Review({ result, confirmed, onConfirm }: ReviewProps) {
  const [measurements, setReviewed] = useState(() => initialReview(result, confirmed));
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftValues>({});
  const [errors, setErrors] = useState<Partial<Record<ReviewedMeasurement['id'], string>>>({});

  const anyEditable = measurements.some(isEditable);
  const isConfirmed = confirmed?.measuredAt === result.measuredAt && confirmed.measurements === measurements;
  const { report } = result;

  const startEditing = () => {
    setDrafts(Object.fromEntries(measurements.filter(isEditable).map((m) => [m.id, draftFor(m)])));
    setErrors({});
    setEditing(true);
  };
  const cancelEditing = () => {
    setDrafts({});
    setErrors({});
    setEditing(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing) {
      const applied = applyDrafts(measurements, drafts);
      if (!applied.ok) {
        setErrors(applied.errors);
        return;
      }
      setReviewed(applied.measurements);
      cancelEditing();
      return;
    }
    onConfirm(confirmMeasurements(result, measurements));
  };

  return (
    <FlowStepForm titleId={TITLE_ID} onSubmit={handleSubmit}>
      <motion.div className="measure-review__context" variants={fadeUpItem}>
        <p>
          <span className="measure-review__context-label">Measured for</span>
          <span className="measure-review__context-value">
            {REGION_LABELS[report.region]}
            {result.clothingType ? ` · ${getClothingItem(result.clothingType).label}` : ''}
          </span>
        </p>
        <p className="measure-review__calibration">{report.calibration.detail}</p>
        {report.warnings.map((warning) => (
          <p key={warning} className="measure-review__warning">
            {warning}
          </p>
        ))}
      </motion.div>

      <FormCard
        titleId="measurements-list-title"
        title={editing ? 'Edit measurements' : 'Measurements'}
        subtitle={
          editing
            ? 'Only measurements with a value can be corrected. Enter centimetres; your value is kept exactly as entered.'
            : undefined
        }
      >
        <ul className="measure-review__list">
          {measurements.map((measurement) => (
            <MeasurementItem
              key={measurement.id}
              measurement={measurement}
              editing={editing}
              draft={drafts[measurement.id]}
              error={errors[measurement.id]}
              onDraftChange={(value) => setDrafts((current) => ({ ...current, [measurement.id]: value }))}
            />
          ))}
        </ul>
      </FormCard>

      <AnimatePresence initial={false}>
        {isConfirmed && !editing && (
          <motion.p
            key="confirmed"
            className="measure-review__confirmed"
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <CircleCheck aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Measurements confirmed.</strong> They are kept in memory on this device for this session. Size
              recommendation is the next step and is not available yet.
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <motion.div className="measure-review__actions" variants={fadeUpItem}>
        <Button to={PATHS.scan} variant="secondary" size="lg">
          <ArrowLeft aria-hidden="true" size={20} />
          Back to Scan
        </Button>
        {editing ? (
          <>
            <Button variant="secondary" size="lg" onClick={cancelEditing}>
              <X aria-hidden="true" size={20} />
              Cancel
            </Button>
            <Button type="submit" size="lg" className="measure-review__primary">
              <Check aria-hidden="true" size={20} />
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={startEditing} disabled={!anyEditable}>
              <PencilLine aria-hidden="true" size={20} />
              Edit Measurements
            </Button>
            <Button type="submit" size="lg" className="measure-review__primary">
              <Check aria-hidden="true" size={20} />
              {isConfirmed ? 'Confirmed' : 'Confirm Measurements'}
            </Button>
          </>
        )}
      </motion.div>
      {!anyEditable && !editing && (
        <p className="measure-review__note">None of these measurements has a value that can be edited.</p>
      )}
    </FlowStepForm>
  );
}

const formatValue = (value: number): string => value.toLocaleString('en', { maximumFractionDigits: 1 });
const unitLabel = (unit: ReviewedMeasurement['unit']): string => (unit === 'cm' ? 'cm' : 'model units');

interface MeasurementItemProps {
  measurement: ReviewedMeasurement;
  editing: boolean;
  draft: string | undefined;
  error: string | undefined;
  onDraftChange: (value: string) => void;
}

function MeasurementItem({ measurement, editing, draft, error, onDraftChange }: MeasurementItemProps) {
  const { status, value, unit } = measurement;
  const level = confidenceLevel(measurement);
  const editable = editing && isEditable(measurement);
  const nameId = `measurement-${measurement.id}-name`;

  return (
    <li className="measure-item" data-status={status} aria-labelledby={nameId}>
      <div className="measure-item__header">
        <h3 id={nameId} className="measure-item__name">
          {measurement.name}
        </h3>
        <span className="measure-item__status">{STATUS_LABELS[status]}</span>
      </div>

      {editable ? (
        <FormField label={`${measurement.name} (${unit})`} hideLabel error={error}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              inputMode="decimal"
              autoComplete="off"
              suffix={unit}
              value={draft ?? ''}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          )}
        </FormField>
      ) : value !== null ? (
        <p className="measure-item__value">
          {formatValue(value)}
          <span className="measure-item__unit"> {unitLabel(unit)}</span>
        </p>
      ) : (
        <p className="measure-item__value measure-item__value--missing">
          {status === 'unsupported' ? 'Currently unavailable' : 'Not measured'}
        </p>
      )}

      <dl className="measure-item__meta">
        {level && (
          <div>
            <dt>Confidence</dt>
            <dd>
              {level} ({Math.round(measurement.confidence * 100)}%)
            </dd>
          </div>
        )}
        {measurement.manuallyEdited && measurement.measuredValue !== null && (
          <div className="measure-item__edited">
            <dt>Edited by you</dt>
            <dd>
              scan measured {formatValue(measurement.measuredValue)} {unitLabel(unit)}
            </dd>
          </div>
        )}
      </dl>

      <p className="measure-item__definition">{measurement.definition}</p>
      {measurement.reason && (
        <p className="measure-item__reason">
          <span className="measure-item__reason-label">Reason: </span>
          {measurement.reason}
        </p>
      )}
    </li>
  );
}
