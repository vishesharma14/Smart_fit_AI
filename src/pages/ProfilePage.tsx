import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ScanLine, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { DemoBadge } from '../components/demo/DemoModeBanner';
import '../components/demo/demo.css';
import { MeasurementHistory } from '../components/profile/MeasurementHistory';
import { MeasurementList } from '../components/results/MeasurementList';
import { SizeHero } from '../components/results/SizeHero';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { FitProfile, ScanRecord } from '../types/profile';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { formatSavedDate, startScanPath } from '../utils/profile/format';
import { REFERENCE_SIZING_NOTE, brandName } from '../utils/sizing/brandCharts';

const TITLE_ID = 'profile-title';

/** Profile (Step 11): the saved fit profile and previous saved results, stored on this device only. */
export function ProfilePage() {
  useDocumentTitle(pageTitle('Fit profile'));
  const profile = useAppStore((s) => s.fitProfile);
  const history = useAppStore((s) => s.scanHistory);
  const hasConfirmed = useAppStore((s) => s.measurements !== null);
  const heightCm = useAppStore((s) => s.userInfo.heightCm);
  const deleteFitProfile = useAppStore((s) => s.deleteFitProfile);
  // In Demo Mode, Scan Again repeats the demo scan (as on Results) instead of ending the demo on the camera page.
  const demoMode = useAppStore((s) => s.demoMode);

  return (
    <FlowStepLayout
      titleId={TITLE_ID}
      title={
        <>
          Your fit <span className="flow-step__title-accent">profile</span>
        </>
      }
      lead="Your saved size and the measurements behind it."
      introExtra={
        <p className="result-card__note profile-privacy">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>
            Saved in this browser on this device only — measurements and sizes, never photos or video. You can delete it at
            any time. More in the <Link to={PATHS.privacy}>Privacy Center</Link>.
          </span>
        </p>
      }
    >
      <motion.div className="flow-step__form" variants={staggerContainer} initial="hidden" animate="visible">
        {profile ? (
          <SavedProfile
            profile={profile}
            previous={history.filter((r) => r.id !== profile.id)}
            hasConfirmed={hasConfirmed}
            scanPath={demoMode ? PATHS.demoScan : startScanPath(heightCm, PATHS)}
            onDelete={deleteFitProfile}
          />
        ) : (
          <motion.section className="result-card profile-empty" aria-labelledby="profile-empty-title" variants={fadeUpItem}>
            <h2 id="profile-empty-title" className="result-card__title">
              No saved fit profile yet
            </h2>
            <p className="result-card__text">
              Scan your body, confirm your measurements and save your result — your size will be kept here.
            </p>
            <div className="result-actions">
              <Button to={startScanPath(heightCm, PATHS)} size="lg">
                <ScanLine aria-hidden="true" size={20} />
                Start New Scan
              </Button>
              {hasConfirmed && (
                <Button to={PATHS.results} variant="secondary" size="lg">
                  View Results
                  <ArrowRight aria-hidden="true" size={20} />
                </Button>
              )}
              <Button to={PATHS.privacy} variant="secondary" size="lg">
                <ShieldCheck aria-hidden="true" size={20} />
                Privacy Center
              </Button>
            </div>
          </motion.section>
        )}
        {!profile && history.length > 0 && <MeasurementHistory records={history} latest={null} />}
      </motion.div>
    </FlowStepLayout>
  );
}

interface SavedProfileProps {
  profile: FitProfile;
  previous: ScanRecord[];
  hasConfirmed: boolean;
  scanPath: string;
  onDelete: () => void;
}

function SavedProfile({ profile, previous, hasConfirmed, scanPath, onDelete }: SavedProfileProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <>
      <SizeHero
        titleId="profile-hero-title"
        eyebrow={profile.demo ? 'Saved size · Demo profile' : 'Saved size'}
        garment={profile.garment}
        size={profile.size}
        fit={profile.fit}
        alternativeSize={profile.alternativeSize}
        basedOnUncertain={profile.basedOnUncertain}
        fitPreference={profile.fitPreference}
        brandName={profile.brand !== 'generic' ? brandName(profile.brand) : null}
      >
        {profile.demo && (
          <p className="demo-inline">
            <DemoBadge label="Demo profile" /> Saved from Demo Mode sample data — not a real scan.
          </p>
        )}
        <dl className="profile-facts">
          <div>
            <dt>{profile.demo ? 'Demo scan' : 'Last scan'}</dt>
            <dd>{formatSavedDate(profile.measuredAt)}</dd>
          </div>
          <div>
            <dt>Saved</dt>
            <dd>{formatSavedDate(profile.savedAt)}</dd>
          </div>
        </dl>
      </SizeHero>

      <motion.section className="result-card" aria-labelledby="profile-measurements-title" variants={fadeUpItem}>
        <h2 id="profile-measurements-title" className="result-card__title">
          Saved measurements
        </h2>
        {profile.measurements.length > 0 ? (
          <MeasurementList
            label="Saved measurements"
            items={profile.measurements.map((m) => ({ ...m, confidence: m.confidence }))}
          />
        ) : (
          <p className="result-card__text">No measurements with a value were saved.</p>
        )}
        {profile.chartName && <p className="result-card__note">Size from the {profile.chartName}.</p>}
        {profile.brand !== 'generic' && <p className="result-card__note">{REFERENCE_SIZING_NOTE}</p>}
      </motion.section>

      <MeasurementHistory records={previous} latest={{ measuredAt: profile.measuredAt, measurements: profile.measurements, demo: profile.demo === true }} />

      <motion.div className="result-actions" variants={fadeUpItem}>
        <Button to={scanPath} size="lg">
          <ScanLine aria-hidden="true" size={20} />
          Scan Again
        </Button>
        {hasConfirmed && (
          <Button to={PATHS.results} variant="secondary" size="lg">
            View Results
          </Button>
        )}
        <Button to={PATHS.privacy} variant="secondary" size="lg">
          <ShieldCheck aria-hidden="true" size={20} />
          Privacy Center
        </Button>
        {confirmingDelete ? (
          <div className="profile-delete" role="group" aria-label="Delete saved profile">
            <p className="result-card__text">Delete your saved profile and previous results from this device?</p>
            <div className="profile-delete__buttons">
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
              <Button variant="secondary" className="profile-delete__confirm" onClick={onDelete}>
                <Trash2 aria-hidden="true" size={18} />
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="lg" onClick={() => setConfirmingDelete(true)}>
            <Trash2 aria-hidden="true" size={20} />
            Delete Profile
          </Button>
        )}
      </motion.div>
    </>
  );
}
