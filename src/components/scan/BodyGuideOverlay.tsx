import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import type { ScanPhaseId } from '../../types/scan';
import { EASE_OUT } from '../../utils/motion';
import { SCAN_PHASES } from '../../utils/scanPhases';
import { MANNEQUIN_MESH } from './mannequin/mannequinGeometry';
import { projectMannequin } from './mannequin/projectMannequin';
import './BodyGuideOverlay.css';

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

/** Opacity of each depth band (see DEPTH_BANDS), farthest to nearest. */
const BAND_OPACITY = [0.32, 0.5, 0.72, 0.92];

interface BodyGuideOverlayProps {
  /** Scan angle the reference figure should demonstrate. */
  phase: ScanPhaseId;
}

/**
 * Positioning guide drawn over the camera preview: frame corners plus a 3D
 * wireframe reference mannequin that turns to the current scan angle. It is a
 * fixed illustration — it does not detect, track or represent the user's body.
 */
export function BodyGuideOverlay({ phase }: BodyGuideOverlayProps) {
  const target = PHASE_YAW[phase];
  const reduceMotion = useReducedMotion();
  const [animatedYaw, setAnimatedYaw] = useState(target);
  const yawRef = useRef(target);

  // Turn smoothly to the new angle. With reduced motion the figure switches instantly (see `yaw` below).
  useEffect(() => {
    if (reduceMotion) {
      yawRef.current = target;
      return;
    }
    const controls = animate(yawRef.current, target, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (value) => {
        yawRef.current = value;
        setAnimatedYaw(value);
      },
    });
    return () => controls.stop();
  }, [target, reduceMotion]);

  const yaw = reduceMotion ? target : animatedYaw;
  const projected = useMemo(() => projectMannequin(MANNEQUIN_MESH, yaw), [yaw]);
  const phaseLabel = SCAN_PHASES.find((p) => p.id === phase)?.label ?? '';

  return (
    <div className="body-guide">
      <svg className="body-guide__svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g className="body-guide__corners">
          <path d="M24 64V32h32" />
          <path d="M244 32h32v32" />
          <path d="M276 336v32h-32" />
          <path d="M56 368H24v-32" />
        </g>

        <path className="body-guide__floor" d={projected.floor} />

        <motion.g
          className="body-guide__figure"
          animate={{ y: [0, -2.5, 0] }}
          transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
        >
          <path className="body-guide__mesh body-guide__mesh--hidden" d={projected.hidden} />
          {projected.visible.map((d, band) => (
            <path
              key={band}
              className="body-guide__mesh body-guide__mesh--visible"
              d={d}
              style={{ opacity: BAND_OPACITY[band] ?? 1 }}
            />
          ))}
        </motion.g>
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
