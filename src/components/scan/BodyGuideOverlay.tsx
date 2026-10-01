import { Suspense, lazy } from 'react';
import type { ScanPhaseId } from '../../types/scan';
import { SCAN_PHASES } from '../../utils/scanPhases';
import './BodyGuideOverlay.css';

// Three.js is only downloaded when the camera preview (and so this guide) is shown.
const MannequinCanvas = lazy(() => import('./mannequin/MannequinCanvas'));

/**
 * How far the reference figure is turned for each angle (radians, 0 = facing
 * the camera). Each phase is a further quarter turn in the same direction, so
 * the figure turns the way the user is asked to turn.
 */
const PHASE_YAW: Record<ScanPhaseId, number> = {
  front: 0,
  left: -Math.PI / 2,
  back: -Math.PI,
  right: (-3 * Math.PI) / 2,
};

interface BodyGuideOverlayProps {
  /** Scan angle the reference figure should demonstrate. */
  phase: ScanPhaseId;
}

/**
 * Positioning guide over the live camera preview: a refined scan frame and a
 * single 3D reference mannequin turned to the current scan angle. It is a
 * fixed illustration — it does not detect, track or represent the user's body.
 */
export function BodyGuideOverlay({ phase }: BodyGuideOverlayProps) {
  const phaseLabel = SCAN_PHASES.find((p) => p.id === phase)?.label ?? '';

  return (
    <div className="body-guide">
      <div className="body-guide__vignette" aria-hidden="true" />

      <Suspense fallback={null}>
        <MannequinCanvas yaw={PHASE_YAW[phase]} />
      </Suspense>

      <svg className="body-guide__frame" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M22 58V36a14 14 0 0 1 14-14h22" />
        <path d="M242 22h22a14 14 0 0 1 14 14v22" />
        <path d="M278 328v22a14 14 0 0 1-14 14h-22" />
        <path d="M58 364H36a14 14 0 0 1-14-14v-22" />
      </svg>

      <p className="visually-hidden">
        Positioning guide: a reference mannequin turned to show the {phaseLabel.toLowerCase()} view. It is an
        illustration only and does not represent or measure your body.
      </p>
      <span className="body-guide__caption" aria-hidden="true">
        Reference guide · not your body
      </span>
    </div>
  );
}
