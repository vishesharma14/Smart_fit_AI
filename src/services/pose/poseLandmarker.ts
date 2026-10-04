import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import wasmNoSimdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import wasmNoSimdBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { PoseDelegate, PoseFrame, PoseLandmark } from '../../types/pose';

/** A segmentation mask, valid only for the duration of the `readMask` call (never keep a reference to `data`). */
export interface MaskView {
  width: number;
  height: number;
  /** `data[y * width + x]`: 0–1 confidence that the pixel belongs to that person. */
  data: Float32Array;
}

/** Reads a detected person's mask during the detection call; `poseIndex` matches `PoseFrame.landmarks`. */
export type MaskReader = (mask: MaskView, poseIndex: number, landmarks: PoseLandmark[]) => void;

/*
 * On-device pose detection with MediaPipe Pose Landmarker (Full model).
 *
 * Everything runs in this browser tab: the WebAssembly runtime and the model
 * file are served by this app (no third-party CDN), each video frame is
 * passed straight from the <video> element to the model, and only the
 * resulting landmark coordinates are returned. Frames are never copied,
 * stored or uploaded. The person segmentation mask is produced by the same
 * model; it can only be read inside the detection call (`readMask`) and is
 * released by the model straight after, so it is never kept.
 */

/** Self-hosted model file (public/models). Full: balanced accuracy and speed. */
export const POSE_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`;
export const POSE_MODEL_NAME = 'pose_landmarker_full (float16)';

/** Up to two people are detected so the scan can ask a second person to step out of view. */
const MAX_POSES = 2;

export interface PoseEngine {
  delegate: PoseDelegate;
  /**
   * Runs the model on the current video frame. `timestampMs` must increase
   * on every call (the model tracks the person between frames). With
   * `readMask`, each person's segmentation mask is handed to it before the
   * call returns (reading it costs a GPU → CPU copy, so only pass it when needed).
   */
  detect: (video: HTMLVideoElement, timestampMs: number, readMask?: MaskReader) => PoseFrame;
  /** Releases the model and its WebAssembly / GPU resources. */
  close: () => void;
}

const toLandmark = (point: NormalizedLandmark): PoseLandmark => ({
  x: point.x,
  y: point.y,
  z: point.z,
  visibility: point.visibility ?? 0,
});

/**
 * True when WebGL is rendered in software (no usable GPU, e.g. SwiftShader or
 * llvmpipe). The GPU delegate is then much slower than the CPU (WebAssembly) one.
 */
function isSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software/i.test(renderer);
  } catch {
    return true;
  }
}

/**
 * Downloads (or reuses from the HTTP cache) the runtime and model and creates
 * a pose engine. Uses the GPU delegate when a hardware GPU is available and
 * falls back to the CPU. `preferred` forces a delegate (for testing).
 */
export async function createPoseEngine(preferred?: PoseDelegate): Promise<PoseEngine> {
  // Loaded on demand so the ~140 kB library is not part of the main bundle.
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const simd = await FilesetResolver.isSimdSupported();
  const fileset = simd
    ? { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl }
    : { wasmLoaderPath: wasmNoSimdLoaderUrl, wasmBinaryPath: wasmNoSimdBinaryUrl };

  const create = (delegate: PoseDelegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: MAX_POSES,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      // Person masks for the body outline (same model, no extra download); read only when requested.
      outputSegmentationMasks: true,
    });

  let delegate: PoseDelegate = preferred ?? (isSoftwareWebGL() ? 'CPU' : 'GPU');
  let landmarker;
  try {
    landmarker = await create(delegate);
  } catch (error) {
    if (delegate === 'CPU') throw error;
    delegate = 'CPU';
    landmarker = await create('CPU');
  }

  return {
    delegate,
    detect: (video, timestampMs, readMask) => {
      let frame: PoseFrame | null = null;
      // Callback form: masks stay owned by the model (no copies) and are valid only inside this callback.
      landmarker.detectForVideo(video, timestampMs, (result) => {
        const detected: PoseFrame = {
          landmarks: result.landmarks.map((pose) => pose.map(toLandmark)),
          worldLandmarks: result.worldLandmarks.map((pose) => pose.map(toLandmark)),
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        };
        frame = detected;
        if (!readMask) return;
        result.segmentationMasks?.forEach((mask, index) => {
          const landmarks = detected.landmarks[index];
          if (landmarks) readMask({ width: mask.width, height: mask.height, data: mask.getAsFloat32Array() }, index, landmarks);
        });
      });
      if (!frame) throw new Error('Pose detection returned no result.');
      return frame;
    },
    close: () => landmarker.close(),
  };
}
