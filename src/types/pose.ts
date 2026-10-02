/**
 * Types for on-device pose detection. Landmarks are body keypoints estimated
 * by the pose model for a single video frame; they are not measurements.
 */

/** One body keypoint. */
export interface PoseLandmark {
  /** Image landmarks: 0–1 across the (unmirrored) video frame. World landmarks: metres from the hip centre. */
  x: number;
  y: number;
  /** Depth. Smaller values are closer to the camera. */
  z: number;
  /** Model's estimate (0–1) that the point is inside the frame and not hidden. */
  visibility: number;
}

/** Pose model output for one video frame. One entry per detected person. */
export interface PoseFrame {
  landmarks: PoseLandmark[][];
  worldLandmarks: PoseLandmark[][];
  videoWidth: number;
  videoHeight: number;
}

export type PoseDelegate = 'GPU' | 'CPU';

export type PoseEngineStatus = 'idle' | 'loading' | 'ready' | 'error';
