import { startTransition, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPoseEngine, type MaskView, type PoseEngine } from '../services/pose/poseLandmarker';
import type { PoseDelegate, PoseEngineStatus, PoseLandmark } from '../types/pose';
import type { FrameQuality, ScanCapture, ScanViewId } from '../types/scan';
import type { SilhouetteFrame } from '../types/silhouette';
import { visibleRegion } from '../utils/pose/landmarks';
import { POSE_SCAN_CONFIG } from '../utils/pose/poseConfig';
import type { CoarseView, OrientationCalibration } from '../utils/pose/poseOrientation';
import type { ScanRegionDefinition } from '../utils/pose/scanRegions';
import { assessPose, measureJitter, type PoseAssessment, type StillnessSample } from '../utils/pose/poseValidation';
import { bodyYawForScan, type BodyYaw } from '../utils/scan360/bodyYaw';
import {
  EMPTY_VIEW_HOLD,
  decideFrame,
  stepViewHold,
  viewHoldProgress,
  type CapturedView,
  type FrameDecision,
  type FrameRejection,
  type HoldFailure,
  type ViewHold,
} from '../utils/scan360/capture';
import { extractSilhouetteFrame } from '../utils/silhouette/extract';
import { assessOutlineFrame, type OutlineQuality } from '../utils/silhouette/outlineQuality';

export interface PoseStats {
  /** Average time the model took per frame over the last few runs, in ms. */
  inferenceMs: number;
  /** Pose model runs completed in the last second. */
  detectionsPerSecond: number;
  /** Average time spent reading the mask and extracting the outline (frames where it was read), in ms. */
  silhouetteMs: number | null;
}

export interface PoseScanState {
  status: PoseEngineStatus;
  delegate: PoseDelegate | null;
  /** Latest per-frame validation for the current angle, or null when detection isn't running. */
  assessment: PoseAssessment | null;
  /** Landmarks moved more than the stillness limit recently, or stillness can't be judged yet. */
  moving: boolean;
  jitter: number | null;
  /** 0–1 progress toward capturing the view being held. */
  holdProgress: number;
  /** View currently being held (accepted frames accumulating), or null. */
  holdView: ScanViewId | null;
  /** Body angle estimated for the latest frame. */
  yaw: BodyYaw | null;
  /** Whether the latest frame counted toward a view, and why not. */
  decision: FrameDecision | null;
  /** Quality of the latest frame's body outline (when its mask was read). */
  outline: OutlineQuality | null;
  /** Why the last completed hold was discarded, if it was. */
  lastHoldFailure: HoldFailure | null;
  /** Frames accepted / rejected (by reason) since detection started; developer view. */
  frameCounts: FrameCounts;
  stats: PoseStats | null;
  /** Latest frame's body outline (developer view only; null otherwise). */
  silhouette: SilhouetteFrame | null;
  /** Try loading the pose model again after an error. */
  retry: () => void;
}

export type FrameCounts = { accepted: number } & Partial<Record<FrameRejection, number>>;

interface UsePoseScanOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Load the model while the camera is on. */
  cameraActive: boolean;
  /** Run detection only while the scan is in progress. */
  scanning: boolean;
  /** Body region to validate (the full body for the 360° scan). */
  scanRegion: ScanRegionDefinition;
  calibration: OrientationCalibration | null;
  /** Lighting and frame-difference movement from the existing frame checks. */
  quality: FrameQuality | null;
  /** Views already captured in this session (no frame counts toward them again). */
  captured: CapturedView[];
  onCapture: (view: ScanViewId, capture: ScanCapture) => void;
  intervalMs?: number;
  /** Force the GPU or CPU delegate (testing only). */
  delegate?: PoseDelegate;
  /** Developer view: read the outline on every analysed frame and expose it. */
  debug?: boolean;
}

type LiveState = Omit<PoseScanState, 'status' | 'delegate' | 'retry'>;

const IDLE_LIVE: LiveState = {
  assessment: null,
  moving: false,
  jitter: null,
  holdProgress: 0,
  holdView: null,
  yaw: null,
  decision: null,
  outline: null,
  lastHoldFailure: null,
  frameCounts: { accepted: 0 },
  stats: null,
  silhouette: null,
};
const STATS_WINDOW = 20;
const MIN_STILLNESS_SAMPLES = 3;
/**
 * Main-thread time left free after each model run: at least this long, and
 * at least as long as the run itself, so detection never takes more than
 * about half the main thread and the page stays responsive on slow devices.
 */
const MIN_IDLE_MS = 40;

/**
 * Real-time detection for the guided 360° scan: loads the on-device pose
 * model while the camera is on and analyses about ten frames per second while
 * scanning. For each frame it validates the pose, estimates the body angle,
 * reads the person's segmentation mask inside the model call and turns it into
 * outline numbers (the mask itself is never kept), and decides whether the
 * frame counts toward an uncaptured view (`decideFrame`). Accepted frames of
 * one view are combined into a capture once they have been steady long enough
 * (`stepViewHold`), and `onCapture` receives landmarks, the angle and the
 * outline numbers — never an image.
 */
export function usePoseScan({
  videoRef,
  cameraActive,
  scanning,
  scanRegion,
  calibration,
  quality,
  captured,
  onCapture,
  intervalMs = POSE_SCAN_CONFIG.inferenceIntervalMs,
  delegate: preferredDelegate,
  debug = false,
}: UsePoseScanOptions): PoseScanState {
  const [engine, setEngine] = useState<PoseEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState<LiveState>(IDLE_LIVE);

  // Latest values for the detection loop, without restarting it on every render.
  const qualityRef = useRef(quality);
  const onCaptureRef = useRef(onCapture);
  const capturedRef = useRef(captured);
  useEffect(() => {
    qualityRef.current = quality;
    onCaptureRef.current = onCapture;
    capturedRef.current = captured;
  }, [quality, onCapture, captured]);

  // Model lifecycle: created while the camera is on, released when it turns off or the page closes.
  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let created: PoseEngine | null = null;
    createPoseEngine(preferredDelegate)
      .then((instance) => {
        if (cancelled) {
          instance.close();
          return;
        }
        created = instance;
        setEngine(instance);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      created?.close();
      setEngine(null);
    };
  }, [cameraActive, attempt, preferredDelegate]);

  const calibrationRatio = calibration?.frontalWidthRatio ?? null;

  // Recent landmark positions for the stillness check. They describe how the body is moving, not which angle
  // is targeted, so they carry over when the target angle changes; they are dropped when scanning stops.
  const stillnessRef = useRef<StillnessSample[]>([]);
  useEffect(() => {
    if (!scanning || !engine) stillnessRef.current = [];
  }, [scanning, engine]);

  // Detection loop: throttled requestAnimationFrame, one model run per interval at most.
  useEffect(() => {
    if (!engine || !scanning) return;
    const calibrationValue = calibrationRatio === null ? null : { frontalWidthRatio: calibrationRatio };
    let frameId = 0;
    let lastRun = -Infinity;
    let lastEnd = -Infinity;
    let lastDuration = 0;
    let lastTimestamp = 0;
    let viewHold: ViewHold = EMPTY_VIEW_HOLD;
    let lastHoldFailure: HoldFailure | null = null;
    let lastPoseValid = false;
    const frameCounts: FrameCounts = { accepted: 0 };
    let previousView: CoarseView | null = null;
    const stillness = stillnessRef.current;
    const timings: number[] = [];
    const runTimes: number[] = [];
    const silhouetteTimings: number[] = [];

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (now - lastRun < intervalMs || now - lastEnd < Math.max(MIN_IDLE_MS, lastDuration)) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
      lastRun = now;

      // The model tracks between frames and needs strictly increasing timestamps.
      const timestamp = Math.max(Math.round(now), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const started = performance.now();
      // The outline is needed whenever the pose is valid (it decides whether a frame counts), and in the developer view.
      const outlineHolder: { frame: SilhouetteFrame | null } = { frame: null };
      const readMask =
        debug || lastPoseValid
          ? (mask: MaskView, index: number, landmarks: PoseLandmark[]) => {
              if (index !== 0) return;
              const begun = performance.now();
              outlineHolder.frame = extractSilhouetteFrame(mask, landmarks);
              silhouetteTimings.push(performance.now() - begun);
              if (silhouetteTimings.length > STATS_WINDOW) silhouetteTimings.shift();
            }
          : undefined;
      let frame;
      try {
        frame = engine.detect(video, timestamp, readMask);
      } catch {
        return;
      }
      // Only one person's outline can be trusted (the scan requires one person anyway).
      const silhouette = frame.landmarks.length === 1 ? outlineHolder.frame : null;
      lastEnd = performance.now();
      lastDuration = lastEnd - started;
      timings.push(lastDuration);
      if (timings.length > STATS_WINDOW) timings.shift();
      runTimes.push(now);
      while (runTimes.length && runTimes[0] < now - 1000) runTimes.shift();

      const region = visibleRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
      const assessment = assessPose({ frame, region, calibration: calibrationValue, previousView, scanRegion });
      previousView = assessment.orientation?.view ?? null;
      lastPoseValid = assessment.issue === null;

      // Stillness from landmark movement over a short window.
      if (assessment.pixels && assessment.metrics) {
        stillness.push({ time: now, pixels: assessment.pixels, scalePx: assessment.metrics.scalePx });
      } else {
        stillness.length = 0;
      }
      // Keep the stillness window, but never fewer than the samples needed to judge it on slow devices.
      while (stillness.length > MIN_STILLNESS_SAMPLES && stillness[0].time < now - POSE_SCAN_CONFIG.stillnessWindowMs) {
        stillness.shift();
      }
      const jitter = measureJitter(stillness, scanRegion.stillnessPoints);
      const moving = jitter === null || jitter > POSE_SCAN_CONFIG.maxJitter;

      const frameQuality = qualityRef.current;
      const lightingOk = frameQuality !== null && frameQuality.brightness === 'ok' && !frameQuality.moving;
      const yaw = assessment.orientation ? bodyYawForScan(assessment.orientation, calibrationValue !== null) : null;
      const outline = assessOutlineFrame(silhouette, assessment.landmarks);
      const decision = decideFrame({
        poseValid: assessment.issue === null,
        lightingOk,
        moving,
        yaw,
        outline,
        captured: capturedRef.current,
      });
      if (decision.accept) frameCounts.accepted += 1;
      else if (decision.reason) frameCounts[decision.reason] = (frameCounts[decision.reason] ?? 0) + 1;

      const sample =
        decision.accept && silhouette && yaw && outline.staturePx !== null && assessment.landmarks && assessment.worldLandmarks
          ? {
              time: now,
              landmarks: assessment.landmarks,
              worldLandmarks: assessment.worldLandmarks,
              silhouette,
              yawDeg: yaw.yawDeg,
              staturePx: outline.staturePx,
              widthRatio: assessment.orientation!.widthRatio,
            }
          : null;
      const step = stepViewHold(viewHold, decision, sample, now);
      viewHold = step.hold;
      if (step.failure) lastHoldFailure = step.failure;
      if (step.capture) {
        const { view, ...data } = step.capture;
        lastHoldFailure = null;
        // Counted as captured at once, so no further frame can start a second capture of this view.
        capturedRef.current = [...capturedRef.current, { view, yawDeg: data.yawDeg }];
        onCaptureRef.current(view, {
          phase: view,
          capturedAt: Date.now(),
          landmarks: data.landmarks,
          worldLandmarks: data.worldLandmarks,
          sampleCount: data.sampleCount,
          holdMs: data.holdMs,
          yawDeg: data.yawDeg,
          videoWidth: frame.videoWidth,
          videoHeight: frame.videoHeight,
          scanRegion: scanRegion.id,
          widthRatio: data.widthRatio,
          orientationConfidence: yaw?.confidence ?? 0,
          silhouette: data.silhouette,
        });
      }
      const progress = viewHoldProgress(viewHold, now);

      // A transition, so these frequent updates never hold up urgent work such as a route change.
      startTransition(() =>
        setLive({
          assessment,
          moving,
          jitter,
          holdProgress: progress,
          holdView: viewHold.view,
          yaw,
          decision,
          outline: silhouette ? outline : null,
          lastHoldFailure,
          frameCounts: { ...frameCounts },
          stats: {
            inferenceMs: timings.reduce((sum, value) => sum + value, 0) / timings.length,
            detectionsPerSecond: runTimes.length,
            silhouetteMs: silhouetteTimings.length
              ? silhouetteTimings.reduce((sum, value) => sum + value, 0) / silhouetteTimings.length
              : null,
          },
          silhouette: debug ? silhouette : null,
        }),
      );
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      // Never show a stale result after pausing or restarting.
      setLive(IDLE_LIVE);
    };
  }, [engine, scanning, scanRegion, calibrationRatio, intervalMs, videoRef, debug]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  const status: PoseEngineStatus = !cameraActive ? 'idle' : engine ? 'ready' : failed ? 'error' : 'loading';
  const running = status === 'ready' && scanning;
  return {
    status,
    delegate: engine?.delegate ?? null,
    ...(running ? live : IDLE_LIVE),
    retry,
  };
}
