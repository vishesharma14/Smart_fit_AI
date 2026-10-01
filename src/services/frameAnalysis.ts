/**
 * Lightweight, on-device frame checks. Each sample is drawn into a tiny
 * in-memory canvas, reduced to a grayscale array, compared with the previous
 * sample and then discarded. No frame is stored, uploaded or kept beyond the
 * previous small grayscale sample used for the movement comparison.
 */

/** Sampling resolution. Small on purpose: enough for brightness/movement, useless as an image. */
export const SAMPLE_WIDTH = 64;
export const SAMPLE_HEIGHT = 48;

/** Average luma (0–255) below / above which lighting is flagged. */
export const DARK_THRESHOLD = 55;
export const BRIGHT_THRESHOLD = 215;

/** Mean absolute grayscale difference between samples above which the frame counts as moving. */
export const MOTION_THRESHOLD = 9;

export interface FrameSampler {
  /** Returns a grayscale sample of the current video frame, or null if the video has no frame yet. */
  sample: (video: HTMLVideoElement) => Uint8ClampedArray | null;
}

export function createFrameSampler(): FrameSampler | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  return {
    sample(video) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return null;
      context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      return toGrayscale(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
    },
  };
}

/** Rec. 601 luma for each RGBA pixel. */
export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    gray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return gray;
}

export function averageLuma(gray: Uint8ClampedArray): number {
  let sum = 0;
  for (const value of gray) sum += value;
  return gray.length ? sum / gray.length : 0;
}

export function meanAbsoluteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
