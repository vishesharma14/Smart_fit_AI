import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  BRIGHT_THRESHOLD,
  DARK_THRESHOLD,
  MOTION_THRESHOLD,
  averageLuma,
  createFrameSampler,
  meanAbsoluteDifference,
} from '../services/frameAnalysis';
import type { BrightnessLevel, FrameQuality } from '../types/scan';

const SAMPLE_INTERVAL_MS = 250;
/** Smoothing so a single odd frame doesn't flip the guidance. */
const LUMA_SMOOTHING = 0.35;
const MOTION_SMOOTHING = 0.5;
/** Movement must fall below this share of the threshold before it counts as still again. */
const STILL_HYSTERESIS = 0.7;

function classifyBrightness(luma: number): BrightnessLevel {
  if (luma < DARK_THRESHOLD) return 'too-dark';
  if (luma > BRIGHT_THRESHOLD) return 'too-bright';
  return 'ok';
}

/**
 * Samples the live video a few times per second while `enabled` and reports
 * lighting and movement. Returns null until the first sample, or when disabled.
 */
export function useFrameQuality(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean): FrameQuality | null {
  const [quality, setQuality] = useState<FrameQuality | null>(null);
  const lumaRef = useRef<number | null>(null);
  const motionRef = useRef(0);
  const movingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const sampler = createFrameSampler();
    if (!sampler) return;

    let previous: Uint8ClampedArray | null = null;
    lumaRef.current = null;
    motionRef.current = 0;
    movingRef.current = false;

    const tick = () => {
      const video = videoRef.current;
      if (!video) return;
      const gray = sampler.sample(video);
      if (!gray) return;

      const luma = averageLuma(gray);
      lumaRef.current = lumaRef.current === null ? luma : lumaRef.current + LUMA_SMOOTHING * (luma - lumaRef.current);

      if (previous) {
        const diff = meanAbsoluteDifference(previous, gray);
        motionRef.current += MOTION_SMOOTHING * (diff - motionRef.current);
        const limit = movingRef.current ? MOTION_THRESHOLD * STILL_HYSTERESIS : MOTION_THRESHOLD;
        movingRef.current = motionRef.current > limit;
      }
      // Keep only the previous tiny grayscale sample for the movement comparison.
      previous = gray;

      const next: FrameQuality = { brightness: classifyBrightness(lumaRef.current), moving: movingRef.current };
      setQuality((current) =>
        current && current.brightness === next.brightness && current.moving === next.moving ? current : next,
      );
    };

    const interval = window.setInterval(tick, SAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      previous = null;
      // Drop the last reading so a paused/resumed scan never shows stale guidance.
      setQuality(null);
    };
  }, [enabled, videoRef]);

  return enabled ? quality : null;
}
