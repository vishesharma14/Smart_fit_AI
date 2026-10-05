import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Bookmark, CircleCheck, PencilLine, ScanLine, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { MeasurementList } from '../components/results/MeasurementList';
import { SizeHero } from '../components/results/SizeHero';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { SizeRecommendation } from '../types/sizing';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { buildFitProfile, isSavedFrom } from '../utils/profile/fitProfile';
import { startScanPath } from '../utils/profile/format';
import { recommendForConfirmed } from '../utils/sizing/fromConfirmed';

const TITLE_ID = 'results-title';
const HERO_ID = 'results-hero-title';

const EMPTY_TITLES: Record<Exclude<SizeRecommendation['status'], 'recommended'>, string> = {
  'insufficient-data': 'Insufficient measurements',
  'outside-range': 'No size on this chart fits',
  unsupported: 'No recommendation available',
};

/** Results (Step 11): the size recommendation for the confirmed measurements, with save / edit / scan-again actions. */
export function ResultsPage() {
  useDocumentTitle(pageTitle('Your size'));
  const navigate = useNavigate();
  const confirmed = useAppStore((s) => s.measurements);
  const scanResult = useAppStore((s) => s.scanMeasurements);
  const clothingSelection = useAppStore((s) => s.clothingSelection);
  const gender = useAppStore((s) => s.userInfo.gender);
  const heightCm = useAppStore((s) => s.userInfo.heightCm);
  const fitProfile = useAppStore((s) => s.fitProfile);
  const saveFitProfile = useAppStore((s) => s.saveFitProfile);

  const recommendation = useMemo(
    () => (confirmed ? recommendForConfirmed(confirmed, clothingSelection, gender) : null),
    [confirmed, clothingSelection, gender],
  );

  return (
    <FlowStepLayout
      titleId={TITLE_ID}
      title={
        <>
          Your <span className="flow-step__title-accent">size</span>
        </>
      }
      lead="Chosen by comparing your confirmed measurements with the garment's size chart — a transparent rule, not a guess."
      topbarExtra={
        <Button to={PATHS.profile} variant="secondary">
          <UserRound aria-hidden="true" size={18} />
          Profile
        </Button>
      }
    >
      <motion.div className="flow-step__form" variants={staggerContainer} initial="hidden" animate="visible">
        {confirmed && recommendation ? (
          <Result
            recommendation={recommendation}
            saved={isSavedFrom(fitProfile, confirmed, recommendation)}
            hasProfileForScan={fitProfile?.measuredAt === confirmed.measuredAt && fitProfile.garment === recommendation.garment}
            confidenceOf={(id) => confirmed.measurements.find((m) => m.id === id)?.confidence ?? null}
            onSave={() => {
              const profile = buildFitProfile(confirmed, recommendation);
              if (profile) saveFitProfile(profile);
            }}
            onEdit={() => navigate(PATHS.measurements, { state: { edit: true } })}
          />
        ) : (
          <motion.section className="result-card" aria-labelledby="results-empty-title" variants={fadeUpItem}>
            <h2 id="results-empty-title" className="result-card__title">
              No confirmed measurements yet
            </h2>
            <p className="result-card__text">
              {scanResult
                ? 'Review and confirm the measurements from your scan to see your size.'
                : 'Complete the guided body scan and confirm your measurements to see your size.'}
            </p>
            <div className="result-actions">
              {scanResult ? (
                <Button to={PATHS.measurements} size="lg">
                  Review measurements
                  <ArrowRight aria-hidden="true" size={20} />
                </Button>
              ) : (
                <Button to={startScanPath(heightCm, PATHS)} size="lg">
                  <ScanLine aria-hidden="true" size={20} />
                  Start a scan
                </Button>
              )}
            </div>
          </motion.section>
        )}
      </motion.div>
    </FlowStepLayout>
  );
}

interface ResultProps {
  recommendation: SizeRecommendation;
  saved: boolean;
  hasProfileForScan: boolean;
  confidenceOf: (id: string) => number | null;
  onSave: () => void;
  onEdit: () => void;
}

function Result({ recommendation, saved, hasProfileForScan, confidenceOf, onSave, onEdit }: ResultProps) {
  const { status, size, fit, alternativeSize, basedOnUncertain, garment, reason, chartName, measurementsUsed } = recommendation;
  const recommended = status === 'recommended' && size !== null;
  const saveLabel = saved ? 'Saved to Profile' : hasProfileForScan ? 'Update Fit Profile' : 'Save Fit Profile';

  return (
    <>
      <SizeHero
        titleId={HERO_ID}
        eyebrow={recommended ? 'Recommended size' : 'Size recommendation'}
        garment={garment}
        size={recommended ? size : null}
        fit={fit}
        alternativeSize={alternativeSize}
        basedOnUncertain={basedOnUncertain}
        emptyTitle={status === 'recommended' ? undefined : EMPTY_TITLES[status]}
      />

      <motion.section className="result-card" aria-labelledby="results-why-title" variants={fadeUpItem}>
        <h2 id="results-why-title" className="result-card__title">
          {recommended ? 'Why this size?' : 'Why no size?'}
        </h2>
        <p className="result-card__text">{reason}</p>
        {chartName && (
          <p className="result-card__note">
            {chartName}: a generic size chart, not a brand's. Sizes vary between brands. This is a rule-based comparison,
            not a machine-learning prediction.
          </p>
        )}
      </motion.section>

      {measurementsUsed.length > 0 && (
        <motion.section className="result-card" aria-labelledby="results-used-title" variants={fadeUpItem}>
          <h2 id="results-used-title" className="result-card__title">
            Measurements used
          </h2>
          <MeasurementList
            label="Measurements used for this size"
            items={measurementsUsed.map((m) => ({
              id: m.id,
              name: m.label,
              valueCm: m.valueCm,
              status: m.status,
              confidence: confidenceOf(m.id),
              manuallyEdited: m.manuallyEdited,
              note: m.sizeForMeasurement ? `→ ${m.sizeForMeasurement}` : undefined,
            }))}
          />
          {basedOnUncertain && (
            <p className="result-card__note">
              Estimates come from your body outline and are not yet validated against tape measurements. If you know a
              value, edit it for a more reliable size.
            </p>
          )}
        </motion.section>
      )}

      {saved && (
        <motion.p className="result-status" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <CircleCheck aria-hidden="true" size={20} />
          <span>Saved to your fit profile on this device.</span>
          <Button to={PATHS.profile} variant="secondary">
            View profile
          </Button>
        </motion.p>
      )}

      <motion.div className="result-actions" variants={fadeUpItem}>
        <Button size="lg" onClick={onSave} disabled={!recommended || saved} className={saved ? 'result-save--saved' : undefined}>
          {saved ? <CircleCheck aria-hidden="true" size={20} /> : <Bookmark aria-hidden="true" size={20} />}
          {saveLabel}
        </Button>
        <Button variant="secondary" size="lg" onClick={onEdit}>
          <PencilLine aria-hidden="true" size={20} />
          Edit Measurements
        </Button>
        <Button to={PATHS.scan} variant="secondary" size="lg">
          <ScanLine aria-hidden="true" size={20} />
          Scan Again
        </Button>
      </motion.div>
      {!recommended && (
        <p className="result-card__note">A fit profile needs a recommended size. Edit your measurements or scan again.</p>
      )}
    </>
  );
}
