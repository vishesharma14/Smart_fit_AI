import type { PoseLandmark } from '../../types/pose';
import type { ScanViewId } from '../../types/scan';
import type { SilhouetteFrame, SilhouetteProfile } from '../../types/silhouette';
import { POSE_SCAN_CONFIG } from '../pose/poseConfig';
import { HOLD_RESET, buildCaptureFromHold, medianLandmarks, stepHold, type HoldState } from '../pose/poseValidation';
import { combineSilhouetteFrames, median } from '../silhouette/combine';
import type { OutlineQuality } from '../silhouette/outlineQuality';
import { SILHOUETTE_CONFIG } from '../silhouette/silhouetteConfig';
import type { BodyYaw } from './bodyYaw';
import { angularDistance, angularSpread, centralAngle, viewAt } from './views';

/*
 * Automatic view capture for the 360° scan, as pure steps:
 *
 * 1. `decideFrame`: does this analysed frame count toward a view? Only with a
 *    valid pose (one person, full body in frame, upright…), good light, a
 *    usable outline, a clear body angle inside an uncaptured view's window
 *    (the front first, since it calibrates the angle), well away from views
 *    already captured, and the person holding still. Otherwise it says why.
 * 2. `stepViewHold`: accepted frames of the same view accumulate; any other
 *    frame starts over. After enough frames over enough time, the hold is
 *    combined (per-landmark and per-row medians) — unless the angle or the
 *    outline height drifted, in which case it is discarded.
 *
 * No camera image ever enters: only landmarks, the body angle and outline numbers.
 */

/**
 * Why a frame doesn't count, in the order checked:
 * - `pose`: a pose check failed (no / several people, framing, distance, hidden joints, posture)
 * - `lighting`: too dark / bright, or the image is moving
 * - `angle-unclear`: the body angle can't be told reliably
 * - `front-first`: the front view hasn't been captured yet (it calibrates the angle estimate)
 * - `between-views`: the angle is between two views' windows
 * - `already-captured`: this view (or one within the minimum separation) is already captured
 * - `outline`: the body outline is missing, cut off or unreliable
 * - `moving`: the body is moving
 */
export type FrameRejection =
  | 'pose'
  | 'lighting'
  | 'angle-unclear'
  | 'front-first'
  | 'between-views'
  | 'already-captured'
  | 'outline'
  | 'moving';

export interface CapturedView {
  view: ScanViewId;
  yawDeg: number | null;
}

export interface FrameDecisionInput {
  poseValid: boolean;
  lightingOk: boolean;
  moving: boolean;
  yaw: BodyYaw | null;
  outline: OutlineQuality;
  captured: CapturedView[];
}

export interface FrameDecision {
  accept: boolean;
  /** View whose window contains the frame's angle (whether or not it is accepted), null between windows. */
  view: ScanViewId | null;
  reason: FrameRejection | null;
}

export type ScanViewConfig = Record<
  'viewHoldMs' | 'viewMinFrames' | 'maxViewYawSpreadDeg' | 'viewToleranceDeg' | 'minViewSeparationDeg' | 'minYawConfidence',
  number
>;

export function decideFrame(input: FrameDecisionInput, config: ScanViewConfig = POSE_SCAN_CONFIG): FrameDecision {
  const view = input.yaw ? viewAt(input.yaw.yawDeg, config.viewToleranceDeg) : null;
  const reject = (reason: FrameRejection): FrameDecision => ({ accept: false, view, reason });
  if (!input.poseValid) return reject('pose');
  if (!input.lightingOk) return reject('lighting');
  if (!input.yaw || input.yaw.confidence < config.minYawConfidence) return reject('angle-unclear');
  const frontDone = input.captured.some((c) => c.view === 'front');
  if (!frontDone && view !== 'front') return reject('front-first');
  if (view === null) return reject('between-views');
  const tooClose = input.captured.some(
    (c) => c.view === view || (c.yawDeg !== null && angularDistance(c.yawDeg, input.yaw!.yawDeg) < config.minViewSeparationDeg),
  );
  if (tooClose) return reject('already-captured');
  if (input.outline.issue !== null) return reject('outline');
  if (input.moving) return reject('moving');
  return { accept: true, view, reason: null };
}

export interface ViewHoldSample {
  time: number;
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  silhouette: SilhouetteFrame;
  yawDeg: number;
  staturePx: number;
  /** Projected shoulder width ÷ torso length (the front view's value calibrates later angle estimates). */
  widthRatio: number;
}

export interface ViewHold {
  view: ScanViewId | null;
  hold: HoldState;
  samples: ViewHoldSample[];
}

export const EMPTY_VIEW_HOLD: ViewHold = { view: null, hold: HOLD_RESET, samples: [] };

export interface ViewCaptureData {
  view: ScanViewId;
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  sampleCount: number;
  holdMs: number;
  yawDeg: number;
  widthRatio: number;
  silhouette: SilhouetteProfile;
}

/** Why a completed hold was discarded instead of captured. */
export type HoldFailure = 'angle-drift' | 'outline-unstable';

export interface ViewHoldStep {
  hold: ViewHold;
  capture: ViewCaptureData | null;
  failure: HoldFailure | null;
}

/** 0–1 progress of the current hold toward a capture. */
export function viewHoldProgress(hold: ViewHold, now: number, config: ScanViewConfig = POSE_SCAN_CONFIG): number {
  if (hold.hold.since === null) return 0;
  return Math.min(1, hold.samples.length / config.viewMinFrames, (now - hold.hold.since) / config.viewHoldMs);
}

/**
 * Adds one analysed frame. `sample` must be given for accepted frames. Returns the new hold, and a capture when
 * the hold completed with steady data (or the reason it was discarded).
 */
export function stepViewHold(
  state: ViewHold,
  decision: FrameDecision,
  sample: ViewHoldSample | null,
  now: number,
  config: ScanViewConfig = POSE_SCAN_CONFIG,
  silhouetteConfig = SILHOUETTE_CONFIG,
): ViewHoldStep {
  if (!decision.accept || !decision.view || !sample) return { hold: EMPTY_VIEW_HOLD, capture: null, failure: null };
  // A frame of a different view starts a new hold.
  const base = state.view === decision.view ? state : EMPTY_VIEW_HOLD;
  const hold = stepHold(base.hold, true, sample.time);
  const next: ViewHold = { view: decision.view, hold, samples: [...base.samples, sample] };
  if (viewHoldProgress(next, now, config) < 1) return { hold: next, capture: null, failure: null };

  const built = buildCaptureFromHold(
    hold,
    next.samples,
    now,
    { captureMinFrames: config.viewMinFrames, captureHoldMs: config.viewHoldMs },
    medianLandmarks,
  );
  const yaws = next.samples.map((s) => s.yawDeg);
  const statures = next.samples.map((s) => s.staturePx);
  const typicalStature = median(statures);
  if (!built) return { hold: EMPTY_VIEW_HOLD, capture: null, failure: null };
  if (angularSpread(yaws) > config.maxViewYawSpreadDeg) return { hold: EMPTY_VIEW_HOLD, capture: null, failure: 'angle-drift' };
  if ((Math.max(...statures) - Math.min(...statures)) / typicalStature > silhouetteConfig.maxStatureSpread) {
    return { hold: EMPTY_VIEW_HOLD, capture: null, failure: 'outline-unstable' };
  }
  const silhouette = combineSilhouetteFrames(next.samples.map((s) => s.silhouette), silhouetteConfig);
  if (!silhouette) return { hold: EMPTY_VIEW_HOLD, capture: null, failure: 'outline-unstable' };
  return {
    hold: EMPTY_VIEW_HOLD,
    capture: {
      view: decision.view,
      ...built,
      yawDeg: centralAngle(yaws)!,
      widthRatio: median(next.samples.map((s) => s.widthRatio)),
      silhouette,
    },
    failure: null,
  };
}
