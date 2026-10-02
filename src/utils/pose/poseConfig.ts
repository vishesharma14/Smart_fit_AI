/**
 * Tunable settings for pose detection, validation and auto-capture. Kept in
 * one place so they can be adjusted after testing on real devices.
 */
export const POSE_SCAN_CONFIG = {
  /** Minimum time between pose model runs (100 ms ≈ 10 inferences per second). */
  inferenceIntervalMs: 100,

  /** Auto-capture: the pose must stay valid for this long… */
  captureHoldMs: 1500,
  /** …and for at least this many consecutive analysed frames. Any invalid frame restarts the count. */
  captureMinFrames: 10,

  /** A landmark counts as seen when the model's visibility score reaches this. */
  minVisibility: 0.5,

  /** Body height (estimated head top to feet) as a share of the visible preview height. */
  minBodyHeight: 0.5,
  maxBodyHeight: 0.92,
  /** Safety margins inside the visible preview, as a share of its height / width. */
  verticalMargin: 0.015,
  horizontalMargin: 0.02,

  /** Torso lean (shoulders to hips) from vertical, in degrees. */
  maxTorsoTiltDeg: 12,
  /** Front / back views: arm angle away from the torso, in degrees. */
  minArmAngleDeg: 12,
  maxArmAngleDeg: 60,
  /** Front / back views: ankle spacing relative to hip spacing. */
  minStanceRatio: 0.55,
  maxStanceRatio: 2.8,

  /** Landmark movement over the stillness window, relative to torso length. */
  maxJitter: 0.035,
  stillnessWindowMs: 600,
} as const;

export type PoseScanConfig = typeof POSE_SCAN_CONFIG;
