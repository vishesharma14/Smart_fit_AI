import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CameraOff, LoaderCircle } from 'lucide-react';
import type { UseCamera } from '../../hooks/useCamera';
import type { ScanPhaseId } from '../../types/scan';
import { CAMERA_ERROR_COPY } from '../../utils/scanGuidance';
import { Button } from '../Button';
import type { ScanGuidance } from '../../utils/scanGuidance';
import { BodyGuideOverlay } from './BodyGuideOverlay';
import { ScanInstruction } from './ScanInstruction';
import './ScanViewport.css';

interface ScanViewportProps {
  camera: UseCamera;
  /** Angle label shown on the preview while scanning, e.g. "Front". */
  phaseLabel: string | null;
  /** Scan angle the reference mannequin demonstrates. */
  guidePhase: ScanPhaseId;
  /** Part of the reference figure to show for the scanned body region. */
  guideRange?: [number, number];
  /** Optional layer drawn over the live preview (e.g. the pose debug skeleton). */
  overlay?: ReactNode;
  /** Primary instruction shown large over the preview while scanning. */
  instruction?: ScanGuidance | null;
}

/** Large camera preview with the body guide overlay, plus the camera-off / loading / error states. */
export function ScanViewport({ camera, phaseLabel, guidePhase, guideRange, overlay, instruction }: ScanViewportProps) {
  const { status, error, facingMode, videoRef, start } = camera;
  const active = status === 'active';
  const canRetry = error !== 'unsupported' && error !== 'insecure-context';
  const mirrored = facingMode === 'user';

  return (
    <div className="scan-viewport" data-camera={status}>
      {/* Kept mounted so the stream can attach as soon as it is ready. */}
      <video
        ref={videoRef}
        className={['scan-viewport__video', mirrored ? 'scan-viewport__video--mirrored' : ''].join(' ')}
        playsInline
        muted
        autoPlay
        aria-label="Live camera preview"
        hidden={!active}
      />

      {active && <BodyGuideOverlay phase={guidePhase} mirrored={mirrored} range={guideRange} />}
      {active && overlay}
      {active && instruction && <ScanInstruction guidance={instruction} />}

      <AnimatePresence>
        {active && phaseLabel && (
          <motion.span
            key={phaseLabel}
            className="scan-viewport__phase"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {phaseLabel}
          </motion.span>
        )}
      </AnimatePresence>

      {!active && (
        <div className="scan-viewport__placeholder">
          {status === 'idle' && (
            <>
              <span className="scan-viewport__icon" aria-hidden="true">
                <Camera size={28} strokeWidth={1.5} />
              </span>
              <p className="scan-viewport__title">Your camera is off</p>
              <p className="scan-viewport__text">
                SizerAI needs camera access to guide you through the scan. You can turn it off at any time.
              </p>
              <Button size="lg" onClick={start}>
                <Camera aria-hidden="true" size={20} />
                Enable camera
              </Button>
            </>
          )}

          {status === 'requesting' && (
            <>
              <span className="scan-viewport__icon scan-viewport__icon--spin" aria-hidden="true">
                <LoaderCircle size={28} strokeWidth={1.5} />
              </span>
              <p className="scan-viewport__title">Waiting for camera permission…</p>
              <p className="scan-viewport__text">Choose Allow in your browser prompt.</p>
            </>
          )}

          {status === 'error' && (
            <>
              <span className="scan-viewport__icon scan-viewport__icon--error" aria-hidden="true">
                <CameraOff size={28} strokeWidth={1.5} />
              </span>
              <p className="scan-viewport__title">{CAMERA_ERROR_COPY[error ?? 'unknown'].title}</p>
              <p className="scan-viewport__text">{CAMERA_ERROR_COPY[error ?? 'unknown'].detail}</p>
              {canRetry && (
                <Button size="lg" onClick={start}>
                  <Camera aria-hidden="true" size={20} />
                  Try again
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
