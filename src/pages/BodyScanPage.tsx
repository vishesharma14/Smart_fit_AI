import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  Pause,
  Play,
  PowerOff,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SwitchCamera,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { StepProgress } from '../components/StepProgress';
import { PoseDebugOverlay } from '../components/scan/PoseDebugOverlay';
import { PoseDebugPanel } from '../components/scan/PoseDebugPanel';
import { ScanCoverage } from '../components/scan/ScanCoverage';
import { ScanStatus } from '../components/scan/ScanStatus';
import { ScanViewport } from '../components/scan/ScanViewport';
import { useCamera } from '../hooks/useCamera';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFrameQuality } from '../hooks/useFrameQuality';
import { usePoseScan, type PoseScanState } from '../hooks/usePoseScan';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useScrollLock } from '../hooks/useScrollLock';
import { useVoiceGuidance } from '../hooks/useVoiceGuidance';
import { useWakeLock } from '../hooks/useWakeLock';
import { useScan360Session, type UseScan360Session } from '../hooks/useScan360Session';
import { FLOW_TOTAL_STEPS } from '../layouts/FlowStepLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import { FIT_DEFINITIONS, getClothingItem } from '../utils/clothingCatalog';
import { pageTitle } from '../utils/constants';
import { measureCompletedScan } from '../utils/measurement/fromScan';
import { fadeUpItem, staggerContainer } from '../utils/motion';
import { SCAN_FRAMING_REGION } from '../utils/pose/scanRegions';
import { deriveScanGuidance } from '../utils/scanGuidance';
import { previewAspectRatio } from '../utils/scanPreview';
import { POSE_SCAN_CONFIG } from '../utils/pose/poseConfig';
import { trackingQuality } from '../utils/scan360/trackingQuality';
import { SCAN_VIEWS, VIEW_BY_ID } from '../utils/scan360/views';
import type { ScanCapture, ScanViewId } from '../types/scan';
import './BodyScanPage.css';

/**
 * Phones and touch tablets (portrait or landscape) get a full-screen scan view
 * while the camera is on, since they are usually propped up and viewed from a
 * distance. Computers keep the page layout.
 */
const IMMERSIVE_QUERY = '(max-width: 47.99rem), (pointer: coarse) and (max-width: 64rem)';
const LANDSCAPE_PHONE_QUERY = '(orientation: landscape) and (max-height: 31.25rem)';
const LANDSCAPE_QUERY = '(orientation: landscape)';

/** How long the "Front view captured" confirmation stays before guidance resumes. */
const CAPTURED_MESSAGE_MS = 1000;

/** Step 3 of the fit flow: guided automatic 360° body scan with on-device pose detection and segmentation. */
export function BodyScanPage() {
  useDocumentTitle(pageTitle('Body scan'));
  const clothing = useAppStore((s) => s.clothingSelection);
  // Every scan frames the whole body: clothing measurements need the head and feet in view so the entered height
  // can scale each capture. (The garment still decides which measurements are reviewed.)
  const scanRegion = SCAN_FRAMING_REGION;
  const camera = useCamera();
  const session = useScan360Session();
  const [searchParams] = useSearchParams();
  const debug = searchParams.has('poseDebug');
  // Testing aid: `?poseDebug&poseDelegate=CPU|GPU` forces the inference delegate.
  const delegateParam = searchParams.get('poseDelegate');
  const forcedDelegate = debug && (delegateParam === 'CPU' || delegateParam === 'GPU') ? delegateParam : undefined;

  const cameraActive = camera.status === 'active';
  const scanning = cameraActive && session.status === 'scanning';

  // Full-screen phone scan: the preview fills the screen and the page behind can't scroll or take focus.
  const phoneLayout = useMediaQuery(IMMERSIVE_QUERY);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  const landscape = useMediaQuery(LANDSCAPE_QUERY);
  const immersive = phoneLayout && cameraActive;
  useScrollLock(immersive);
  // Keep the screen awake while the camera is on (where supported).
  useWakeLock(cameraActive);
  const pageRef = useRef<HTMLDivElement>(null);
  // Tablets and small laptops: bring the whole preview into view when the camera starts.
  useEffect(() => {
    if (!cameraActive || phoneLayout) return;
    const stage = pageRef.current?.querySelector('.scan-page__stage');
    const rect = stage?.getBoundingClientRect();
    if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
      stage?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [cameraActive, phoneLayout]);
  useEffect(() => {
    const hidden = pageRef.current?.querySelectorAll<HTMLElement>(
      '.scan-page__header, .scan-page__intro, .scan-page__panel, .scan-page__privacy',
    );
    hidden?.forEach((element) => {
      element.inert = immersive;
    });
  }, [immersive]);
  const quality = useFrameQuality(camera.videoRef, scanning);

  // Brief confirmation after each automatic capture.
  const [justCaptured, setJustCaptured] = useState<ScanViewId | null>(null);
  useEffect(() => {
    if (!justCaptured) return;
    const timeout = window.setTimeout(() => setJustCaptured(null), CAPTURED_MESSAGE_MS);
    return () => window.clearTimeout(timeout);
  }, [justCaptured]);

  const { capture } = session;
  const handleCapture = useCallback(
    (view: ScanViewId, snapshot: ScanCapture) => {
      capture(view, snapshot);
      setJustCaptured(view);
    },
    [capture],
  );

  // The front view calibrates this person's frontal shoulder width, which the body-angle estimate relies on.
  const frontCapture = session.captures.front;
  const captured = useMemo(
    () => SCAN_VIEWS.flatMap((v) => (session.captures[v.id] ? [{ view: v.id, yawDeg: session.captures[v.id]!.yawDeg ?? null }] : [])),
    [session.captures],
  );
  const pose = usePoseScan({
    videoRef: camera.videoRef,
    cameraActive,
    // Detection keeps running during the brief "captured" confirmation, so tracking carries straight on.
    scanning,
    scanRegion,
    calibration: frontCapture ? { frontalWidthRatio: frontCapture.widthRatio } : null,
    quality,
    captured,
    onCapture: handleCapture,
    delegate: forcedDelegate,
    debug,
  });

  // Closing the circle: once the four cardinal views are captured, facing the camera again (a valid, clearly frontal
  // pose) completes the scan.
  const { returnedToFront } = session;
  const backAtFront =
    session.status === 'scanning' &&
    session.coverage.cardinalsDone &&
    pose.assessment?.issue === null &&
    pose.decision?.view === 'front' &&
    (pose.yaw?.confidence ?? 0) >= POSE_SCAN_CONFIG.minYawConfidence;
  useEffect(() => {
    if (backAtFront) returnedToFront();
  }, [backAtFront, returnedToFront]);

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
      ? (immersive ? stageRef : panelRef).current?.querySelector<HTMLElement>('.scan-page__primary')
      : stageRef.current?.querySelector<HTMLElement>('.scan-viewport .button');
    target?.focus();
  }, [camera.status, sessionStatus, cameraActive, immersive]);

  const guidance = deriveScanGuidance({
    cameraStatus: camera.status,
    cameraError: camera.error,
    sessionStatus: session.status,
    quality,
    pose,
    coverage: session.coverage,
    justCaptured: session.status === 'scanning' ? justCaptured : null,
    finishedEarly: session.finishedEarly,
    scanRegion,
  });
  const tracking = trackingQuality(pose.decision, pose.yaw, pose.outline);
  // The reference figure demonstrates the next view to turn to (a full turn once only the circle is left to close).
  const guideYawDeg = session.target ? VIEW_BY_ID[session.target].yawDeg : session.coverage.cardinalsDone ? 360 : 0;
  const previewLabel =
    session.status !== 'scanning'
      ? null
      : pose.holdView
        ? `Capturing ${VIEW_BY_ID[pose.holdView].label.toLowerCase()}`
        : `${session.coverage.captured.length} of ${SCAN_VIEWS.length} views`;

  // Optional spoken guidance: the same instruction as on screen, never a factor in capture.
  const voiceGuidance = useAppStore((s) => s.voiceGuidance);
  const setVoiceGuidance = useAppStore((s) => s.setVoiceGuidance);
  const voice = useVoiceGuidance(guidance, voiceGuidance && cameraActive);

  const clothingLabel = clothing
    ? `${getClothingItem(clothing.type).label}${clothing.fit ? ` · ${FIT_DEFINITIONS[clothing.fit].label} fit` : ''}`
    : null;

  // Scan finished: run the measurement engine on the captured views and open the review.
  const navigate = useNavigate();
  const userHeightCm = useAppStore((s) => s.userInfo.heightCm);
  const setScanMeasurements = useAppStore((s) => s.setScanMeasurements);
  const reviewMeasurements = () => {
    setScanMeasurements(measureCompletedScan({ captures: session.captures, clothingType: clothing?.type, userHeightCm }));
    navigate(PATHS.measurements);
  };

  return (
    <div ref={pageRef} className="scan-page">
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
            Stand with your whole body in view and turn slowly to your left, all the way round. New angles are detected
            and captured automatically; just pause briefly when asked to hold still.
          </p>
          <div className="scan-page__region" data-region={scanRegion.id}>
            <ScanLine className="scan-page__region-icon" aria-hidden="true" size={20} strokeWidth={1.75} />
            <div>
              <p className="scan-page__region-title">Guided 360° scan</p>
              <p className="scan-page__region-text">
                {scanRegion.summary} {scanRegion.postureHint}
              </p>
              <p className="scan-page__region-text scan-page__region-hint">
                For best accuracy, wear fitted clothing and tie back long hair.
              </p>
              <p className="scan-page__region-text scan-page__region-note">
                Camera-based measurements are estimates. For best results, wear fitted clothing, keep your full body
                visible, and follow the scan guidance.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.div
          ref={stageRef}
          className={[
            'scan-page__stage',
            immersive ? 'scan-page__stage--immersive' : '',
            immersive && landscapePhone ? 'scan-page__stage--landscape' : '',
          ].join(' ')}
          variants={fadeUpItem}
          style={{ '--preview-aspect': previewAspectRatio(camera.videoSize, immersive && landscape) } as CSSProperties}
          aria-label={immersive ? 'Body scan camera' : undefined}
          role={immersive ? 'region' : undefined}
        >
          {immersive && (
            <div className="scan-page__immersive-top">
              <ScanCoverage
                captured={session.coverage.captured}
                holdView={pose.holdView}
                liveYawDeg={scanning ? (pose.yaw?.yawDeg ?? null) : null}
                tracking={scanning ? tracking : null}
                compact
              />
              {landscapePhone && <p className="scan-page__rotate-hint">Portrait orientation works best for scanning.</p>}
            </div>
          )}
          <div className="scan-page__preview">
          <ScanViewport
            camera={camera}
            phaseLabel={previewLabel}
            guideYawDeg={guideYawDeg}
            guideRange={scanRegion.guideRange}
            // On phones the instruction lives in the bottom dock instead, keeping the preview clear.
            instruction={immersive ? null : guidance}
            overlay={
              debug && (
                <PoseDebugOverlay
                  landmarks={pose.assessment?.landmarks ?? null}
                  videoWidth={camera.videoRef.current?.videoWidth ?? 0}
                  videoHeight={camera.videoRef.current?.videoHeight ?? 0}
                  mirrored={camera.facingMode === 'user'}
                  valid={pose.assessment?.issue === null}
                  silhouette={pose.silhouette}
                />
              )
            }
          />
          </div>
          {cameraActive && (
            <div className="scan-page__dock">
              {immersive && (
                // Guidance and status in thumb reach; this also announces guidance (the panel is hidden behind).
                <>
                  <ScanStatus guidance={guidance} />
                  {pose.status === 'error' && (
                    <Button variant="secondary" onClick={pose.retry}>
                      <RotateCcw aria-hidden="true" size={18} />
                      Try loading pose detection again
                    </Button>
                  )}
                </>
              )}
              <div className="scan-page__camera-actions">
                {immersive && <ScanControls session={session} onReview={reviewMeasurements} compact />}
                {camera.canSwitch && (
                  <Button variant="secondary" onClick={camera.switchCamera} aria-label={immersive ? 'Switch camera' : undefined}>
                    <SwitchCamera aria-hidden="true" size={18} />
                    {immersive ? 'Switch' : 'Switch camera'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setVoiceGuidance(!voiceGuidance)}
                  aria-pressed={voice.supported ? voiceGuidance : undefined}
                  aria-label={voice.supported ? 'Voice guidance' : 'Voice guidance unavailable'}
                  disabled={!voice.supported}
                >
                  {voiceGuidance && voice.supported ? (
                    <Volume2 aria-hidden="true" size={18} />
                  ) : (
                    <VolumeX aria-hidden="true" size={18} />
                  )}
                  {voice.supported
                    ? `${immersive ? 'Voice' : 'Voice guidance'}: ${voiceGuidance ? 'On' : 'Off'}`
                    : immersive
                      ? 'No voice'
                      : 'Voice guidance unavailable'}
                </Button>
                <Button variant="secondary" onClick={camera.stop} aria-label={immersive ? 'Exit and turn off camera' : undefined}>
                  <PowerOff aria-hidden="true" size={18} />
                  {immersive ? 'Exit' : 'Turn off camera'}
                </Button>
              </div>
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

          {cameraActive && <PoseEngineNote pose={pose} />}

          <div className="scan-page__phases">
            <h2 className="scan-page__subheading">360° coverage</h2>
            <ScanCoverage
              captured={session.coverage.captured}
              holdView={pose.holdView}
              liveYawDeg={scanning ? (pose.yaw?.yawDeg ?? null) : null}
              tracking={scanning ? tracking : null}
            />
            <MissingViews session={session} />
          </div>

          {cameraActive && !immersive && <ScanControls session={session} onReview={reviewMeasurements} />}

          {debug && cameraActive && (
            <PoseDebugPanel pose={pose} camera={camera} scanRegion={scanRegion} captures={session.captures} coverage={session.coverage} />
          )}
        </motion.section>

        <motion.p className="scan-page__privacy" variants={fadeUpItem}>
          <ShieldCheck className="scan-page__privacy-icon" aria-hidden="true" size={20} strokeWidth={1.75} />
          <span>
            <strong>Your camera is used for body scanning.</strong> The video is analysed on this device only: for
            lighting, movement, your body pose (joint positions) and your body outline. Video frames and the outline
            image are not uploaded or saved; for each angle only the detected joint positions and the outline’s edge
            positions (numbers) are kept in memory. Measurements are calculated from them on this device, and the camera
            turns off when you leave this page.
          </span>
        </motion.p>
      </motion.div>
    </div>
  );
}

interface ScanControlsProps {
  session: UseScan360Session;
  /** Runs the measurement engine on the completed scan and opens the review. */
  onReview: () => void;
  /** Shorter labels for the full-screen phone control bar. */
  compact?: boolean;
}

/**
 * Start / Pause / Resume share one primary button so keyboard focus stays in
 * place as the scan changes state. Views are captured automatically; "Finish
 * now" appears only once enough views exist for at least some measurements.
 */
function ScanControls({ session, onReview, compact = false }: ScanControlsProps) {
  const { status } = session;
  const primary =
    status === 'ready'
      ? { label: 'Start scan', icon: Play, onClick: session.start, variant: 'primary' as const }
      : status === 'scanning'
        ? { label: 'Pause scan', icon: Pause, onClick: session.pause, variant: 'secondary' as const }
        : status === 'paused'
          ? { label: 'Resume scan', icon: Play, onClick: session.resume, variant: 'primary' as const }
          : { label: 'Restart scan', icon: RotateCcw, onClick: session.restart, variant: 'secondary' as const };
  const PrimaryIcon = primary.icon;

  return (
    <div className="scan-page__controls">
      <Button size="lg" variant={primary.variant} onClick={primary.onClick} className="scan-page__primary">
        <PrimaryIcon aria-hidden="true" size={20} />
        {primary.label}
      </Button>

      {(status === 'scanning' || status === 'paused') && (
        <Button variant="secondary" size="lg" onClick={session.restart}>
          <RotateCcw aria-hidden="true" size={18} />
          {compact ? 'Restart' : 'Restart scan'}
        </Button>
      )}

      {(status === 'scanning' || status === 'paused') && session.coverage.canFinishEarly && !session.coverage.complete && (
        <Button variant="secondary" size="lg" onClick={session.finishEarly}>
          <Check aria-hidden="true" size={18} />
          {compact ? 'Finish' : `Finish with ${session.coverage.captured.length} views`}
        </Button>
      )}

      {status === 'finished' && (
        <Button size="lg" onClick={onReview}>
          {compact ? 'Review' : 'Review measurements'}
          <ArrowRight aria-hidden="true" size={20} />
        </Button>
      )}
    </div>
  );
}

/** What is still missing for full coverage, and what a scan finished now would lack. */
function MissingViews({ session }: { session: UseScan360Session }) {
  const { status, coverage, finishedEarly } = session;
  if (status === 'ready' || (status === 'finished' && !finishedEarly)) return null;
  const missing = coverage.missingCardinal.map((id) => VIEW_BY_ID[id].label.toLowerCase());
  if (missing.length === 0) {
    return status === 'finished' ? null : (
      <p className="scan-page__coverage-note">Main views done. Keep turning to face the camera to finish.</p>
    );
  }
  return (
    <p className="scan-page__coverage-note">
      Still needed: {missing.join(', ')}.{' '}
      {coverage.canFinishEarly
        ? 'You can finish now, but measurements that need the missing views will be unavailable or less certain.'
        : 'At least the front and one side view are needed before any girth can be measured.'}
    </p>
  );
}

/** States what the detection engine is doing, and offers a retry if the model failed to load. */
function PoseEngineNote({ pose }: { pose: PoseScanState }) {
  if (pose.status === 'error') {
    return (
      <div className="scan-page__engine-note scan-page__engine-note--error">
        <Cpu aria-hidden="true" size={16} strokeWidth={2} />
        <span>
          <strong>Pose detection unavailable.</strong> The on-device pose model could not be loaded, so angles cannot be
          captured.{' '}
          <button type="button" className="scan-page__text-button" onClick={pose.retry}>
            Try again
          </button>
        </span>
      </div>
    );
  }
  return (
    <p className="scan-page__engine-note">
      <Cpu aria-hidden="true" size={16} strokeWidth={2} />
      <span>
        <strong>{pose.status === 'ready' ? 'On-device pose detection active.' : 'Loading on-device pose detection…'}</strong>{' '}
        Your body position and angle are checked from detected joint positions, and each angle is captured only when the
        pose is confirmed. Measurements are calculated from the captured joint positions and body outline once all
        angles are done.
      </span>
    </p>
  );
}
