import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ScanLine, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { MeasurementList } from '../components/results/MeasurementList';
import { SizeHero } from '../components/results/SizeHero';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { FitProfile, ScanRecord } from '../types/profile';
import { getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { formatSavedDate, startScanPath } from '../utils/profile/format';
import { FIT_LABELS } from '../utils/sizing/recommendSize';

const TITLE_ID = 'profile-title';

/** Profile (Step 11): the saved fit profile and previous saved results, stored on this device only. */
export function ProfilePage() {
  useDocumentTitle(pageTitle('Fit profile'));
  const profile = useAppStore((s) => s.fitProfile);
  const history = useAppStore((s) => s.scanHistory);
  const hasConfirmed = useAppStore((s) => s.measurements !== null);
  const heightCm = useAppStore((s) => s.userInfo.heightCm);
  const deleteFitProfile = useAppStore((s) => s.deleteFitProfile);

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
          <ShieldCheck aria-hidden="true" size={16} /> Saved in this browser on this device only — measurements and sizes,
          never photos or video. You can delete it at any time.
        </p>
      }
    >
      <motion.div className="flow-step__form" variants={staggerContainer} initial="hidden" animate="visible">
        {profile ? (
          <SavedProfile
            profile={profile}
            previous={history.filter((r) => r.id !== profile.id)}
            hasConfirmed={hasConfirmed}
            scanPath={startScanPath(heightCm, PATHS)}
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
                Start a scan
              </Button>
              {hasConfirmed && (
                <Button to={PATHS.results} variant="secondary" size="lg">
                  View your results
                  <ArrowRight aria-hidden="true" size={20} />
                </Button>
              )}
            </div>
          </motion.section>
        )}
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
        eyebrow="Saved size"
        garment={profile.garment}
        size={profile.size}
        fit={profile.fit}
        alternativeSize={profile.alternativeSize}
        basedOnUncertain={profile.basedOnUncertain}
        fitPreference={profile.fitPreference}
      >
        <dl className="profile-facts">
          <div>
            <dt>Last scan</dt>
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
      </motion.section>

      <motion.section className="result-card" aria-labelledby="profile-history-title" variants={fadeUpItem}>
        <h2 id="profile-history-title" className="result-card__title">
          Previous results
        </h2>
        {previous.length > 0 ? (
          <ul className="result-history">
            {previous.map((r) => (
              <li key={r.id} className="result-history__item">
                <span>
                  <span className="result-history__size">{r.size}</span> · {getClothingItem(r.garment).label} ·{' '}
                  {FIT_LABELS[r.fit]}
                </span>
                <span className="result-history__date">{formatSavedDate(r.measuredAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="result-card__text">No previous results yet. Each new result you save is listed here.</p>
        )}
      </motion.section>

      <motion.div className="result-actions" variants={fadeUpItem}>
        <Button to={scanPath} size="lg">
          <ScanLine aria-hidden="true" size={20} />
          Scan Again
        </Button>
        {hasConfirmed && (
          <Button to={PATHS.results} variant="secondary" size="lg">
            View latest results
          </Button>
        )}
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
