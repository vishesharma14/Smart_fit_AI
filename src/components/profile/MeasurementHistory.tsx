import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, GitCompareArrows } from 'lucide-react';
import type { MeasurementId } from '../../types/measurement';
import type { SavedMeasurement, ScanRecord } from '../../types/profile';
import { FIT_DEFINITIONS, getClothingItem } from '../../utils/clothingCatalog';
import {
  compareMeasurements,
  formatChangeCm,
  type MeasurementComparisonRow,
} from '../../utils/profile/compareMeasurements';
import { formatSavedDate } from '../../utils/profile/format';
import { brandName } from '../../utils/sizing/brandCharts';
import { FIT_LABELS } from '../../utils/sizing/recommendSize';
import { fadeUpItem } from '../../utils/motion';
import { Button } from '../Button';
import { DemoBadge } from '../demo/DemoModeBanner';
import '../demo/demo.css';
import { MeasurementList } from '../results/MeasurementList';
import '../results/results.css';
import './MeasurementHistory.css';

/** The latest saved measurements (the fit profile) that history records are compared with. */
export interface LatestMeasurements {
  measuredAt: string;
  measurements: SavedMeasurement[];
  /** The latest saved result is Demo Mode sample data (Step 18). */
  demo?: boolean;
}

interface MeasurementHistoryProps {
  /** Earlier saved results, newest first (the latest saved result is shown above, not here). */
  records: ScanRecord[];
  /** Null when there is no saved fit profile to compare with. */
  latest: LatestMeasurements | null;
}

/** Shown on each card when the record has them. */
const KEY_MEASUREMENTS: MeasurementId[] = ['chest', 'waist', 'hip'];

const formatCm = (cm: number) => `${cm.toLocaleString('en', { maximumFractionDigits: 1 })} cm`;

/**
 * Measurement History (Step 16): earlier saved results as they were saved — never recalculated with today's charts
 * or preferences — with their details and an optional comparison with the latest saved measurements.
 */
export function MeasurementHistory({ records, latest }: MeasurementHistoryProps) {
  const canCompare = latest !== null && latest.measurements.length > 0;
  return (
    <motion.section className="result-card" aria-labelledby="profile-history-title" variants={fadeUpItem}>
      <h2 id="profile-history-title" className="result-card__title">
        Measurement History
      </h2>
      {records.length > 0 ? (
        <>
          <p className="result-card__text">Earlier results saved on this device, newest first — each exactly as it was saved.</p>
          <ul className="history-list">
            {records.map((r) => (
              <HistoryItem key={r.id} record={r} latest={canCompare ? latest : null} />
            ))}
          </ul>
          {!canCompare && <p className="result-card__note">Save a fit profile to compare future measurements.</p>}
        </>
      ) : (
        <p className="result-card__text">
          No earlier results yet. Each result you save is kept here so you can compare it with your latest measurements.
        </p>
      )}
    </motion.section>
  );
}

function HistoryItem({ record, latest }: { record: ScanRecord; latest: LatestMeasurements | null }) {
  const id = useId();
  const [showDetails, setShowDetails] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const garmentLabel = getClothingItem(record.garment).label;
  const date = formatSavedDate(record.measuredAt);
  const context = `${garmentLabel} result from ${date}`;
  const branded = record.brand && record.brand !== 'generic' ? brandName(record.brand) : null;
  const keyMeasurements = KEY_MEASUREMENTS.flatMap((key) => record.measurements?.find((m) => m.id === key) ?? []);
  const comparable = latest !== null && record.measurements !== undefined;
  const detailsId = `${id}-details`;
  const comparisonId = `${id}-comparison`;
  // Accessible names start with the visible text and add which result they belong to.
  const detailsLabel = showDetails ? 'Hide Details' : 'View Details';
  const comparisonLabel = showComparison ? 'Hide Comparison' : 'Compare with Latest';

  return (
    <li className="history-item">
      <div className="history-item__head">
        <h3 className="history-item__title">
          {garmentLabel}
          {branded && (
            <>
              {' · '}
              <span className="history-item__brand">{branded}</span>
            </>
          )}
        </h3>
        <time className="history-item__date" dateTime={record.measuredAt}>
          {date}
        </time>
      </div>

      <div className="history-item__summary">
        <p className="history-item__size">
          Recommended size: <strong>{record.size}</strong>
        </p>
        <span className="result-pill" data-fit={record.fit}>
          {FIT_LABELS[record.fit]}
        </span>
        {record.fitPreference && <span className="result-tag">{FIT_DEFINITIONS[record.fitPreference].label}</span>}
      </div>

      {record.demo && (
        <p className="demo-inline">
          <DemoBadge label="Demo data" /> Sample data from Demo Mode, not a real scan.
        </p>
      )}

      {keyMeasurements.length > 0 && (
        <dl className="history-item__key">
          {keyMeasurements.map((m) => (
            <div key={m.id}>
              <dt>{m.name}</dt>
              <dd>{formatCm(m.valueCm)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="history-item__actions">
        <Button
          variant="secondary"
          aria-expanded={showDetails}
          aria-controls={detailsId}
          aria-label={`${detailsLabel} for the ${context}`}
          onClick={() => setShowDetails((v) => !v)}
        >
          <ChevronDown aria-hidden="true" size={18} className="history-item__chevron" data-open={showDetails} />
          {detailsLabel}
        </Button>
        {comparable && (
          <Button
            variant="secondary"
            aria-expanded={showComparison}
            aria-controls={comparisonId}
            aria-label={`${comparisonLabel} for the ${context}`}
            onClick={() => setShowComparison((v) => !v)}
          >
            <GitCompareArrows aria-hidden="true" size={18} />
            {comparisonLabel}
          </Button>
        )}
      </div>

      {showDetails && (
        <motion.div
          id={detailsId}
          className="history-panel"
          role="region"
          aria-label={`Details of the ${context}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <HistoryDetails record={record} garmentLabel={garmentLabel} context={context} />
        </motion.div>
      )}
      {showComparison && latest && record.measurements && (
        <motion.div
          id={comparisonId}
          className="history-panel"
          role="region"
          aria-label={`Comparison of the ${context} with your latest measurements`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <HistoryComparison previous={record.measurements} latest={latest} previousIsDemo={record.demo === true} />
        </motion.div>
      )}
    </li>
  );
}

function HistoryDetails({ record, garmentLabel, context }: { record: ScanRecord; garmentLabel: string; context: string }) {
  return (
    <>
      <dl className="history-facts">
        <div>
          <dt>Scan date</dt>
          <dd>{formatSavedDate(record.measuredAt)}</dd>
        </div>
        <div>
          <dt>Saved</dt>
          <dd>{formatSavedDate(record.savedAt)}</dd>
        </div>
        <div>
          <dt>Garment</dt>
          <dd>{garmentLabel}</dd>
        </div>
        {record.demo && (
          <div>
            <dt>Source</dt>
            <dd>Demo Mode sample data</dd>
          </div>
        )}
        {record.brand && (
          <div>
            <dt>Size chart</dt>
            <dd>{record.brand === 'generic' ? 'Generic' : `${brandName(record.brand)} (reference chart)`}</dd>
          </div>
        )}
        {record.fitPreference && (
          <div>
            <dt>Fit preference</dt>
            <dd>{FIT_DEFINITIONS[record.fitPreference].label}</dd>
          </div>
        )}
        <div>
          <dt>Recommended size</dt>
          <dd>{record.size}</dd>
        </div>
        <div>
          <dt>Fit</dt>
          <dd>{FIT_LABELS[record.fit]}</dd>
        </div>
      </dl>
      {record.measurements === undefined ? (
        <p className="result-card__text">
          Measurements were not kept for this result: it was saved before measurement history was added.
        </p>
      ) : record.measurements.length > 0 ? (
        <MeasurementList label={`Measurements saved with the ${context}`} items={record.measurements} />
      ) : (
        <p className="result-card__text">No measurements with a value were saved.</p>
      )}
      <p className="result-card__note">A saved snapshot: shown as it was saved, not recalculated with today's size charts or preferences.</p>
    </>
  );
}

const CHANGE_TEXT: Record<MeasurementComparisonRow['change'], (row: MeasurementComparisonRow) => string> = {
  increase: (row) => `${formatChangeCm(row.changeCm!)} Increase`,
  decrease: (row) => `${formatChangeCm(row.changeCm!)} Decrease`,
  'no-change': () => 'No meaningful change',
  unavailable: () => 'Comparison unavailable',
};

function HistoryComparison({
  previous,
  latest,
  previousIsDemo,
}: {
  previous: SavedMeasurement[];
  latest: LatestMeasurements;
  previousIsDemo: boolean;
}) {
  const { rows, comparableCount } = compareMeasurements(previous, latest.measurements);
  return (
    <>
      {(previousIsDemo || latest.demo) && (
        <p className="demo-inline">
          <DemoBadge label="Demo data" />
          {previousIsDemo && latest.demo
            ? 'Both records are Demo Mode sample data.'
            : previousIsDemo
              ? 'This earlier record is Demo Mode sample data.'
              : 'Your latest saved result is Demo Mode sample data.'}
        </p>
      )}
      <p className="result-card__text">
        Compared with your latest saved measurements (scan of {formatSavedDate(latest.measuredAt)}). Change = latest −
        previous.
      </p>
      {comparableCount === 0 ? (
        <p className="history-empty">No comparable measurements in these two records.</p>
      ) : (
        <ul className="history-compare" aria-label="Measurement changes">
          {rows.map((row) => (
            <li key={row.id} className="history-compare__row" data-change={row.change}>
              <span className="history-compare__name">{row.name}</span>
              <dl className="history-compare__values">
                <div>
                  <dt>Previous</dt>
                  <dd>{row.previousCm === null ? 'Not recorded' : formatCm(row.previousCm)}</dd>
                </div>
                <div>
                  <dt>Latest</dt>
                  <dd>{row.latestCm === null ? 'Not available' : formatCm(row.latestCm)}</dd>
                </div>
              </dl>
              <p className="history-compare__change">{CHANGE_TEXT[row.change](row)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="result-card__note">
        A plain measurement comparison. Differences can also come from the scan itself (pose, clothing, lighting) or from
        values you edited; they are not a health or fitness assessment.
      </p>
    </>
  );
}
