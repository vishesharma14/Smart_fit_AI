import { motion } from 'framer-motion';
import { Camera, Check, Database, EyeOff, HardDrive, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/Button';
import { DeleteSavedData } from '../components/privacy/DeleteSavedData';
import '../components/privacy/PrivacyCenter.css';
import '../components/results/results.css';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FlowStepLayout } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { FitProfile } from '../types/profile';
import { getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { formatSavedDate } from '../utils/profile/format';

const TITLE_ID = 'privacy-title';

/**
 * Only statements the implementation backs up: the camera stream is analysed in the browser, the fit profile and its
 * history are the only body data written to storage (browser localStorage), and the page's network connections are
 * limited to its own origin by the CSP in index.html.
 */
const PRIVACY_SETUP = [
  'Camera input is analysed in this browser while you scan',
  'Saved profile and history are stored in this browser’s local storage',
  'Camera frames, photos, video and body outline images are not saved',
  'No SizerAI account is required',
  'No SizerAI server stores your saved profile',
  'Network connections are limited to the app’s own address',
] as const;

/** Privacy Center (Step 17): what SizerAI processes and stores, where it lives, and deleting the saved data. */
export function PrivacyCenterPage() {
  useDocumentTitle(pageTitle('Privacy Center'));
  const fitProfile = useAppStore((s) => s.fitProfile);
  const scanHistory = useAppStore((s) => s.scanHistory);
  const deleteFitProfile = useAppStore((s) => s.deleteFitProfile);
  const hasSavedData = fitProfile !== null || scanHistory.length > 0;

  return (
    <FlowStepLayout
      titleId={TITLE_ID}
      title={
        <>
          Privacy <span className="flow-step__title-accent">Center</span>
        </>
      }
      lead="Understand what SizerAI processes, stores, and keeps on your device."
      introExtra={
        <section className="result-card privacy-setup" aria-labelledby="privacy-setup-title">
          <h2 id="privacy-setup-title" className="result-card__title">
            Current privacy setup
          </h2>
          <ul className="privacy-checklist">
            {PRIVACY_SETUP.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" size={18} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      }
      topbarExtra={
        <Button to={PATHS.profile} variant="secondary">
          <UserRound aria-hidden="true" size={18} />
          Profile
        </Button>
      }
    >
      <motion.div className="flow-step__form" variants={staggerContainer} initial="hidden" animate="visible">
        <PrivacySection id="privacy-stores" icon={<Database size={20} />} title="What SizerAI stores">
          <p className="result-card__text">
            Only when you choose <strong>Save Fit Profile</strong>. Depending on the saved result, SizerAI may keep:
          </p>
          <ul className="privacy-list">
            <li>
              Your saved fit profile: the garment, recommended size, fit, alternative size and the size chart used, and
              whether it was created from Demo Mode sample data.
            </li>
            <li>Your fit preference (Slim, Regular or Relaxed) and the reference brand chart, if one was chosen.</li>
            <li>
              The confirmed measurements that had a value, in centimetres, with their status, confidence and whether you
              edited them.
            </li>
            <li>When the scan was measured, confirmed and saved.</li>
            <li>
              A short history of up to 10 saved results. Newer entries keep the same kind of snapshot; results saved before
              measurement history existed keep only the garment, size, fit and dates.
            </li>
          </ul>
          <p className="result-card__text">
            Your display settings (height and weight units, theme and voice guidance on/off) are stored as well.
          </p>
          <SavedNow profile={fitProfile} historyCount={scanHistory.length} />
        </PrivacySection>

        <PrivacySection id="privacy-not-stored" icon={<EyeOff size={20} />} title="What SizerAI does not store">
          <ul className="privacy-list">
            <li>Camera frames, photos or video.</li>
            <li>The body segmentation mask (the outline image) the pose model produces.</li>
            <li>Raw pose data: the detected joint positions and outline edge positions are not part of the saved profile or history.</li>
            <li>Your name, age, gender, height or weight: these stay in memory for the current session only.</li>
          </ul>
        </PrivacySection>

        <PrivacySection id="privacy-camera" icon={<Camera size={20} />} title="Camera processing">
          <ul className="privacy-list">
            <li>The camera (video only, no microphone) is used only on the Body Scan page and turns off when you leave it.</li>
            <li>
              The live camera input is analysed in this browser to check lighting and framing, detect your pose and body
              outline, and estimate your measurements. The pose model is downloaded with the app and runs on your device.
            </li>
            <li>
              While a scan is active, the joint positions and outline edge positions for each captured angle (numbers, not
              images) are kept in memory to calculate your measurements. They belong to the current session and are not
              saved with your profile or history; the browser frees that memory on its own schedule.
            </li>
            <li>
              Demo Mode never turns on the camera: it uses a fixed set of predefined sample measurements. A demo result
              you save is stored like any saved result and marked as demo data.
            </li>
            <li>
              Optional voice guidance uses your browser’s built-in speech. Depending on the browser, the spoken instruction
              text (for example “Turn slowly to your left”) may be processed by the browser vendor’s online voice service.
              No body data is spoken.
            </li>
          </ul>
        </PrivacySection>

        <PrivacySection id="privacy-where" icon={<HardDrive size={20} />} title="Where your saved data lives">
          <ul className="privacy-list">
            <li>In this browser’s local storage on this device. It is not synced to other devices or backed up by SizerAI.</li>
            <li>SizerAI has no backend or account system: no SizerAI server receives or stores your profile.</li>
            <li>
              SizerAI does not encrypt this data separately, so anyone who can use this browser profile could see it.
            </li>
            <li>Clearing this site’s data in your browser settings also removes it. Private windows may not keep it.</li>
          </ul>
        </PrivacySection>

        <PrivacySection id="privacy-delete" icon={<Trash2 size={20} />} title="Delete your saved data">
          <p className="result-card__text">
            You can permanently remove the saved SizerAI profile and associated local history from this browser. Your
            display settings and any scan in progress are not affected, and no other website’s data is touched.
          </p>
          <DeleteSavedData hasSavedData={hasSavedData} onDelete={deleteFitProfile} />
        </PrivacySection>

        <motion.p className="result-card__note privacy-footnote" variants={fadeUpItem}>
          <ShieldCheck aria-hidden="true" size={16} />
          This page describes how the app currently works. It is not a legal privacy policy or guarantee.
        </motion.p>
      </motion.div>
    </FlowStepLayout>
  );
}

function PrivacySection({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <motion.section className="result-card privacy-section" aria-labelledby={`${id}-title`} variants={fadeUpItem}>
      <h2 id={`${id}-title`} className="result-card__title privacy-section__title">
        <span className="privacy-section__icon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

/** What is saved in this browser right now (read from the store; nothing is described that is not there). */
function SavedNow({ profile, historyCount }: { profile: FitProfile | null; historyCount: number }) {
  return (
    <div className="privacy-now" role="status" aria-live="polite">
      <p className="privacy-now__label">Saved in this browser now</p>
      {profile || historyCount > 0 ? (
        <p className="result-card__text">
          {profile
            ? `Fit profile: ${getClothingItem(profile.garment).label}, size ${profile.size}, saved ${formatSavedDate(profile.savedAt)}`
            : 'No fit profile'}
          {' · '}
          {historyCount === 1 ? '1 saved result in history' : `${historyCount} saved results in history`}
        </p>
      ) : (
        <p className="result-card__text">No saved fit profile or history.</p>
      )}
    </div>
  );
}
