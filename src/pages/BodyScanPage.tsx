import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Info, Pause, Play, PowerOff, RotateCcw, ShieldCheck, SwitchCamera } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { StepProgress } from '../components/StepProgress';
import { ScanPhaseProgress } from '../components/scan/ScanPhaseProgress';
import { ScanStatus } from '../components/scan/ScanStatus';
import { ScanViewport } from '../components/scan/ScanViewport';
import { useCamera } from '../hooks/useCamera';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFrameQuality } from '../hooks/useFrameQuality';
import { useScanSession, type UseScanSession } from '../hooks/useScanSession';
import { FLOW_TOTAL_STEPS } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { isBodyDetectionAvailable } from '../services/bodyDetection';
import { useAppStore } from '../store/useAppStore';
import { FIT_DEFINITIONS, getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { deriveScanGuidance } from '../utils/scanGuidance';
import './BodyScanPage.css';

const ENGINE_NOTE_ID = 'scan-engine-note';

/** Step 3 of the fit flow: camera-guided multi-angle body scan (guidance foundation). */
export function BodyScanPage() {
  useDocumentTitle(pageTitle('Body scan'));
  const clothing = useAppStore((s) => s.clothingSelection);
  const camera = useCamera();
  const session = useScanSession();
  const detectionAvailable = isBodyDetectionAvailable();

  const cameraActive = camera.status === 'active';
  const quality = useFrameQuality(camera.videoRef, cameraActive && session.status === 'scanning');

  // If the camera stops mid-scan (turned off, unplugged, permission revoked), pause instead of carrying on blind.
  const { status: sessionStatus, pause } = session;
  useEffect(() => {
    if (!cameraActive && sessionStatus === 'scanning') pause();
  }, [cameraActive, sessionStatus, pause]);

  // When the focused control disappears (e.g. "Enable camera" once the camera starts), move focus to the
  // control that replaced it instead of dropping it to the top of the page. Never steals focus from elsewhere.
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const focusStateRef = useRef(`${camera.status}|${sessionStatus}`);
  useEffect(() => {
    const state = `${camera.status}|${sessionStatus}`;
    if (state === focusStateRef.current) return;
    focusStateRef.current = state;
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = cameraActive
      ? panelRef.current?.querySelector<HTMLElement>('.scan-page__primary')
      : stageRef.current?.querySelector<HTMLElement>('.scan-viewport .button');
    target?.focus();
  }, [camera.status, sessionStatus, cameraActive]);

  const guidance = deriveScanGuidance({
    cameraStatus: camera.status,
    cameraError: camera.error,
    sessionStatus: session.status,
    phase: session.currentPhase,
    quality,
    detection: null,
    detectionAvailable,
    anyCaptured: Object.values(session.phases).includes('captured'),
  });

  const clothingLabel = clothing
    ? `${getClothingItem(clothing.type).label}${clothing.fit ? ` · ${FIT_DEFINITIONS[clothing.fit].label} fit` : ''}`
    : null;
  const showPhaseOnPreview = session.status === 'scanning' || session.status === 'paused';

  return (
    <div className="scan-page">
      <motion.div
        className="scan-page__header"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Button to={PATHS.clothing} variant="secondary" className="scan-page__back">
          <ArrowLeft aria-hidden="true" size={18} />
          <span className="scan-page__back-text">Back</span>
          <span className="visually-hidden"> to clothing selection</span>
        </Button>
        <BrandLogo className="scan-page__logo" />
        <StepProgress current={3} total={FLOW_TOTAL_STEPS} label="Body scan" />
      </motion.div>

      <motion.div className="scan-page__layout" variants={staggerContainer} initial="hidden" animate="visible">
        <motion.section className="scan-page__intro" aria-labelledby="scan-title" variants={fadeUpItem}>
          {clothingLabel && (
            <p className="scan-page__context">
              <span className="scan-page__context-label">Scanning for</span>
              <span className="scan-page__context-value">{clothingLabel}</span>
            </p>
          )}
          <h1 id="scan-title" className="scan-page__title">
            Body <span className="flow-step__title-accent">scan</span>
          </h1>
          <p className="scan-page__lead">
            Stand back so your whole body is visible, then turn slowly through four angles: front, left side, back and
            right side.
          </p>
        </motion.section>

        <motion.div ref={stageRef} className="scan-page__stage" variants={fadeUpItem}>
          <ScanViewport
            camera={camera}
            phaseLabel={showPhaseOnPreview ? session.currentPhase.label : null}
            guideView={session.currentPhase.id === 'left' || session.currentPhase.id === 'right' ? 'profile' : 'frontal'}
          />
          {cameraActive && (
            <div className="scan-page__camera-actions">
              {camera.canSwitch && (
                <Button variant="secondary" onClick={camera.switchCamera}>
                  <SwitchCamera aria-hidden="true" size={18} />
                  Switch camera
                </Button>
              )}
              <Button variant="secondary" onClick={camera.stop}>
                <PowerOff aria-hidden="true" size={18} />
                Turn off camera
              </Button>
            </div>
          )}
        </motion.div>

        <motion.section
          ref={panelRef}
          className="scan-page__panel"
          aria-label="Scan progress and controls"
          variants={fadeUpItem}
        >
          <ScanStatus guidance={guidance} />

          {!detectionAvailable && (
            <p id={ENGINE_NOTE_ID} className="scan-page__engine-note">
              <Info aria-hidden="true" size={16} strokeWidth={2} />
              <span>
                <strong>Scan guidance preview.</strong> Body detection engine not connected yet. Lighting and movement
                checks are live, but body position and angles are not verified, so no angle can be captured and no
                measurements are taken.
              </span>
            </p>
          )}

          <div className="scan-page__phases">
            <h2 className="scan-page__subheading">Scan angles</h2>
            <ScanPhaseProgress phases={session.phases} />
          </div>

          {cameraActive && <ScanControls session={session} previewMode={!detectionAvailable} />}
        </motion.section>

        <motion.p className="scan-page__privacy" variants={fadeUpItem}>
          <ShieldCheck className="scan-page__privacy-icon" aria-hidden="true" size={20} strokeWidth={1.75} />
          <span>
            <strong>Your camera is used for body scanning.</strong> In this version the video is only checked on this
            device for lighting and movement; no measurements are estimated yet. Raw camera data is not intentionally
            stored or uploaded by this interface, and the camera turns off when you leave this page.
          </span>
        </motion.p>
      </motion.div>
    </div>
  );
}

interface ScanControlsProps {
  session: UseScanSession;
  /** No detection engine: allow stepping through angles as an explicit, uncaptured preview. */
  previewMode: boolean;
}

/**
 * Start / Pause / Resume share one primary button so keyboard focus stays in
 * place as the scan changes state. Other controls appear only when relevant.
 */
function ScanControls({ session, previewMode }: ScanControlsProps) {
  const { status } = session;
  const primary =
    status === 'ready'
      ? { label: 'Start scan', icon: Play, onClick: session.start, variant: 'primary' as const }
      : status === 'scanning'
        ? { label: 'Pause scan', icon: Pause, onClick: session.pause, variant: 'secondary' as const }
        : status === 'paused'
          ? { label: 'Resume scan', icon: Play, onClick: session.resume, variant: 'primary' as const }
          : { label: 'Restart scan', icon: RotateCcw, onClick: session.restart, variant: 'primary' as const };
  const PrimaryIcon = primary.icon;
  const isLastPhase = session.phaseIndex === 3;

  return (
    <div className="scan-page__controls">
      <Button size="lg" variant={primary.variant} onClick={primary.onClick} className="scan-page__primary">
        <PrimaryIcon aria-hidden="true" size={20} />
        {primary.label}
      </Button>

      {previewMode && status === 'scanning' && (
        <Button variant="secondary" size="lg" onClick={session.previewNext} aria-describedby={ENGINE_NOTE_ID}>
          {isLastPhase ? 'Finish preview' : 'Preview next angle'}
          <ChevronRight aria-hidden="true" size={20} />
        </Button>
      )}

      {(status === 'scanning' || status === 'paused') && (
        <Button variant="secondary" size="lg" onClick={session.restart}>
          <RotateCcw aria-hidden="true" size={18} />
          Restart scan
        </Button>
      )}

      {status === 'finished' && (
        <p className="scan-page__next-note">Measurements are the next step and are not available yet.</p>
      )}
    </div>
  );
}
