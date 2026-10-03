import { startTransition, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPoseEngine, type PoseEngine } from '../services/pose/poseLandmarker';
import type { PoseDelegate, PoseEngineStatus } from '../types/pose';
import type { FrameQuality, ScanCapture, ScanPhaseId } from '../types/scan';
import { visibleRegion } from '../utils/pose/landmarks';
import { POSE_SCAN_CONFIG } from '../utils/pose/poseConfig';
import type { CoarseView, OrientationCalibration } from '../utils/pose/poseOrientation';
import type { ScanRegionDefinition } from '../utils/pose/scanRegions';
import {
  HOLD_RESET,
  assessPose,
  buildCaptureFromHold,
  holdProgress,
  measureJitter,
  stepHold,
  type HoldState,
  type PoseAssessment,
  type StillnessSample,
  type ValidatedSample,
} from '../utils/pose/poseValidation';

export interface PoseStats {
  /** Average time the model took per frame over the last few runs, in ms. */
  inferenceMs: number;
  /** Pose model runs completed in the last second. */
  detectionsPerSecond: number;
}

export interface PoseScanState {
  status: PoseEngineStatus;
  delegate: PoseDelegate | null;
  /** Latest per-frame validation for the current angle, or null when detection isn't running. */
  assessment: PoseAssessment | null;
  /** Landmarks moved more than the stillness limit recently, or stillness can't be judged yet. */
  moving: boolean;
  jitter: number | null;
  /** 0–1 progress toward auto-capture of the current angle. */
  holdProgress: number;
  stats: PoseStats | null;
  /** Try loading the pose model again after an error. */
  retry: () => void;
}

interface UsePoseScanOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Load the model while the camera is on. */
  cameraActive: boolean;
  /** Run detection only while the scan is in progress. */
  scanning: boolean;
  target: ScanPhaseId;
  /** Body region to validate (from the selected clothing). */
  scanRegion: ScanRegionDefinition;
  calibration: OrientationCalibration | null;
  /** Lighting and frame-difference movement from the existing frame checks. */
  quality: FrameQuality | null;
  onCapture: (phase: ScanPhaseId, capture: ScanCapture) => void;
  intervalMs?: number;
  /** Force the GPU or CPU delegate (testing only). */
  delegate?: PoseDelegate;
}

interface LiveState {
  assessment: PoseAssessment | null;
  moving: boolean;
  jitter: number | null;
  holdProgress: number;
  stats: PoseStats | null;
}

const IDLE_LIVE: LiveState = { assessment: null, moving: false, jitter: null, holdProgress: 0, stats: null };
const STATS_WINDOW = 20;
const MIN_STILLNESS_SAMPLES = 3;
/**
 * Main-thread time left free after each model run: at least this long, and
 * at least as long as the run itself, so detection never takes more than
 * about half the main thread and the page stays responsive on slow devices.
 */
const MIN_IDLE_MS = 40;

/**
 * Real-time pose detection for the scan: loads the on-device pose model while
 * the camera is on, analyses about ten frames per second while scanning,
 * validates the pose for the current angle, and calls `onCapture` with a
 * landmark snapshot once the pose has been valid and still for the hold time.
 */
export function usePoseScan({
  videoRef,
  cameraActive,
  scanning,
  target,
  scanRegion,
  calibration,
  quality,
  onCapture,
  intervalMs = POSE_SCAN_CONFIG.inferenceIntervalMs,
  delegate: preferredDelegate,
}: UsePoseScanOptions): PoseScanState {
  const [engine, setEngine] = useState<PoseEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState<LiveState>(IDLE_LIVE);

  // Latest values for the detection loop, without restarting it on every render.
  const qualityRef = useRef(quality);
  const onCaptureRef = useRef(onCapture);
  useEffect(() => {
    qualityRef.current = quality;
    onCaptureRef.current = onCapture;
  });

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

  // Detection loop: throttled requestAnimationFrame, one model run per interval at most.
  useEffect(() => {
    if (!engine || !scanning) return;
    const calibrationValue = calibrationRatio === null ? null : { frontalWidthRatio: calibrationRatio };
    let frameId = 0;
    let lastRun = -Infinity;
    let lastEnd = -Infinity;
    let lastDuration = 0;
    let lastTimestamp = 0;
    let hold: HoldState = HOLD_RESET;
    // Only frames that passed every check for this angle enter the capture buffer; any invalid frame empties it.
    let holdSamples: ValidatedSample[] = [];
    // Set once this angle has been captured: the loop then stops analysing, so the angle can never be captured
    // twice and no later (e.g. turning) frame can reach the saved data.
    let captured = false;
    let previousView: CoarseView | null = null;
    const stillness: StillnessSample[] = [];
    const timings: number[] = [];
    const runTimes: number[] = [];

    const tick = (now: number) => {
      if (captured) return;
      frameId = requestAnimationFrame(tick);
      if (now - lastRun < intervalMs || now - lastEnd < Math.max(MIN_IDLE_MS, lastDuration)) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
      lastRun = now;

      // The model tracks between frames and needs strictly increasing timestamps.
      const timestamp = Math.max(Math.round(now), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const started = performance.now();
      let frame;
      try {
        frame = engine.detect(video, timestamp);
      } catch {
        return;
      }
      lastEnd = performance.now();
      lastDuration = lastEnd - started;
      timings.push(lastDuration);
      if (timings.length > STATS_WINDOW) timings.shift();
      runTimes.push(now);
      while (runTimes.length && runTimes[0] < now - 1000) runTimes.shift();

      const region = visibleRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
      const assessment = assessPose({ frame, region, target, calibration: calibrationValue, previousView, scanRegion });
      previousView = assessment.orientation?.view ?? null;

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
      const valid =
        assessment.issue === null &&
        !moving &&
        frameQuality !== null &&
        frameQuality.brightness === 'ok' &&
        !frameQuality.moving;

      const validSample: ValidatedSample | null =
        valid && assessment.landmarks && assessment.worldLandmarks
          ? { time: now, landmarks: assessment.landmarks, worldLandmarks: assessment.worldLandmarks }
          : null;
      hold = stepHold(hold, validSample !== null, now);
      if (validSample) {
        holdSamples.push(validSample);
      } else {
        holdSamples = [];
      }
      const progress = holdProgress(hold, now);

      if (progress >= 1 && validSample && assessment.orientation?.orientation === target) {
        const result = buildCaptureFromHold(hold, holdSamples, now);
        if (result) {
          captured = true;
          cancelAnimationFrame(frameId);
          onCaptureRef.current(target, {
            phase: target,
            capturedAt: Date.now(),
            ...result,
            videoWidth: frame.videoWidth,
            videoHeight: frame.videoHeight,
            scanRegion: scanRegion.id,
            widthRatio: assessment.orientation.widthRatio,
            orientationConfidence: assessment.orientation.confidence,
          });
        }
        // Either way the hold starts over; an untrustworthy buffer is discarded, never saved.
        hold = HOLD_RESET;
        holdSamples = [];
      }

      // A transition, so these frequent updates never hold up urgent work such as a route change.
      startTransition(() =>
        setLive({
          assessment,
          moving,
          jitter,
          holdProgress: progress >= 1 ? 1 : progress,
          stats: {
            inferenceMs: timings.reduce((sum, value) => sum + value, 0) / timings.length,
            detectionsPerSecond: runTimes.length,
          },
        }),
      );
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      holdSamples = [];
      stillness.length = 0;
      // Never show a stale result after pausing or moving to the next angle.
      setLive(IDLE_LIVE);
    };
  }, [engine, scanning, target, scanRegion, calibrationRatio, intervalMs, videoRef]);

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
