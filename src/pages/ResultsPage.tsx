import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Bookmark, CircleCheck, PencilLine, ScanLine, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/form/SegmentedControl';
import { MeasurementList } from '../components/results/MeasurementList';
import { SizeHero } from '../components/results/SizeHero';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ScanQuality } from '../types/scanQuality';
import type { BrandSizeRecommendation, SizeRecommendation, SizingBrandId } from '../types/sizing';
import { FIT_DEFINITIONS, getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { buildFitProfile, isSavedFrom } from '../utils/profile/fitProfile';
import { startScanPath } from '../utils/profile/format';
import { LEVEL_LABELS } from '../utils/scanQuality/scanQuality';
import { REFERENCE_CHART_DISCLAIMER, REFERENCE_SIZING_NOTE, SIZING_BRAND_OPTIONS } from '../utils/sizing/brandCharts';
import { recommendBrandForConfirmed } from '../utils/sizing/fromConfirmed';
import { REFERENCE_CHART_UNAVAILABLE } from '../utils/sizing/recommendBrandSize';

const TITLE_ID = 'results-title';
const HERO_ID = 'results-hero-title';

const EMPTY_TITLES: Record<Exclude<SizeRecommendation['status'], 'recommended'>, string> = {
  'insufficient-data': 'Insufficient measurements',
  'outside-range': 'No size on this chart fits',
  unsupported: 'No recommendation available',
};

const BRAND_SEGMENTS = SIZING_BRAND_OPTIONS.map((o) => ({ value: o.id, label: o.name }));

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
  const brand = useAppStore((s) => s.sizingBrand);
  const setSizingBrand = useAppStore((s) => s.setSizingBrand);

  const recommendation = useMemo(
    () => (confirmed ? recommendBrandForConfirmed(confirmed, clothingSelection, gender, brand) : null),
    [confirmed, clothingSelection, gender, brand],
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
            scanQuality={scanResult?.measuredAt === confirmed.measuredAt ? (scanResult.scanQuality ?? null) : null}
            onBrandChange={setSizingBrand}
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
  recommendation: BrandSizeRecommendation;
  saved: boolean;
  hasProfileForScan: boolean;
  confidenceOf: (id: string) => number | null;
  /** Quality of the scan these measurements came from (Step 14), shown as a small secondary note. */
  scanQuality: ScanQuality | null;
  onBrandChange: (brand: SizingBrandId) => void;
  onSave: () => void;
  onEdit: () => void;
}

function Result({ recommendation, saved, hasProfileForScan, confidenceOf, scanQuality, onBrandChange, onSave, onEdit }: ResultProps) {
  const { status, size, fit, alternativeSize, basedOnUncertain, garment, reason, chartName, measurementsUsed, fitPreference } = recommendation;
  const { brand, brandName, chartAvailable } = recommendation;
  const isBrand = brand !== 'generic';
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
        fitPreference={fitPreference}
        emptyTitle={status === 'recommended' ? undefined : chartAvailable ? EMPTY_TITLES[status] : REFERENCE_CHART_UNAVAILABLE}
        fitLabel={chartAvailable ? undefined : REFERENCE_CHART_UNAVAILABLE}
        brandName={isBrand ? brandName : null}
      >
        {scanQuality && (
          <p className="result-hero__quality" data-level={scanQuality.level}>
            Scan quality: {LEVEL_LABELS[scanQuality.level]} · {scanQuality.score}/100
          </p>
        )}
      </SizeHero>

      <motion.section className="result-card result-brand" aria-labelledby="results-brand-title" variants={fadeUpItem}>
        <h2 id="results-brand-title" className="result-card__title">
          Brand
        </h2>
        <p className="result-card__text">
          Use reference brand sizing. Generic uses SizerAI's generic size chart.
        </p>
        <SegmentedControl
          legend="Use reference brand sizing"
          options={BRAND_SEGMENTS}
          value={brand}
          onChange={onBrandChange}
          className="segmented--block"
        />
        {isBrand && (
          <p className="result-card__note">
            {REFERENCE_SIZING_NOTE} {REFERENCE_CHART_DISCLAIMER}
          </p>
        )}
      </motion.section>

      <motion.section className="result-card" aria-labelledby="results-why-title" variants={fadeUpItem}>
        <h2 id="results-why-title" className="result-card__title">
          {recommended ? 'Why this size?' : 'Why no size?'}
        </h2>
        <p className="result-card__text">{reason}</p>
        {recommended && garment && (
          <p className="result-card__text">
            The recommendation considers your body measurements, the {isBrand ? `${brandName} reference ` : ''}
            {getClothingItem(garment).label} size chart and your selected fit preference ({FIT_DEFINITIONS[fitPreference].label}). The preference only decides between
            neighbouring sizes near a size boundary; it does not change or improve your measurements.
          </p>
        )}
        {chartName && isBrand && (
          <p className="result-card__note">
            {chartName}: a hand-entered reference chart, not official {brandName} data. {REFERENCE_CHART_DISCLAIMER} This is a
            rule-based comparison, not a machine-learning prediction.
          </p>
        )}
        {chartName && !isBrand && (
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
