import { nearestView } from '../../utils/scan360/views';
import MannequinCanvas from './mannequin/MannequinCanvas';
import './BodyGuideOverlay.css';

interface BodyGuideOverlayProps {
  /**
   * Body angle the reference figure should demonstrate, in degrees (0 = facing the camera, increasing as the user
   * turns to their left; values past 360 keep turning the same way).
   */
  yawDeg: number;
  /**
   * Whether the camera preview is mirrored (front camera). The figure turns
   * the way the user appears to turn on screen, so it turns the other way
   * when the preview is not mirrored (rear camera).
   */
  mirrored: boolean;
  /** Vertical part of the figure to show for the scanned region (0 = feet, 1 = head top). */
  range?: [number, number];
}

/**
 * Positioning guide over the live camera preview: a refined scan frame and a
 * single 3D reference mannequin turned to the next view to capture. It is a
 * fixed illustration — it does not detect, track or represent the user's body.
 */
export function BodyGuideOverlay({ yawDeg, mirrored, range }: BodyGuideOverlayProps) {
  const phaseLabel = nearestView(yawDeg).label;
  // Turning left reads as a clockwise turn of the figure on a mirrored preview, the other way on a rear camera.
  const yaw = (-yawDeg * Math.PI) / 180;

  return (
    <div className="body-guide">
      <div className="body-guide__vignette" aria-hidden="true" />

      {/* Imported statically: a lazily loaded chunk could be missing after a redeploy (a page opened before the
          deploy requests the old file name) and crash the scan page. */}
      <MannequinCanvas yaw={mirrored ? yaw : -yaw} range={range} />

      <svg className="body-guide__frame" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M22 58V36a14 14 0 0 1 14-14h22" />
        <path d="M242 22h22a14 14 0 0 1 14 14v22" />
        <path d="M278 328v22a14 14 0 0 1-14 14h-22" />
        <path d="M58 364H36a14 14 0 0 1-14-14v-22" />
      </svg>

      <p className="visually-hidden">
        Positioning guide: a reference mannequin turned to show the {phaseLabel.toLowerCase()} view to turn to. It is an
        illustration only and does not represent or measure your body.
      </p>
      <span className="body-guide__caption" aria-hidden="true">
        Reference guide · not your body
      </span>
    </div>
  );
}
