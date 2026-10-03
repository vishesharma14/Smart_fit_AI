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

/**
 * Samples are taken every 125 ms, but movement compares frames 250 ms apart
 * (two samples back), so movement is measured over the same interval as
 * before — same sensitivity, same thresholds — while the result updates twice
 * as often.
 */
const SAMPLE_INTERVAL_MS = 125;
const COMPARE_SAMPLES_BACK = 2;
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

    // Only the last couple of tiny grayscale samples are kept, for the movement comparison.
    let previous: Uint8ClampedArray[] = [];
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

      if (previous.length >= COMPARE_SAMPLES_BACK) {
        const diff = meanAbsoluteDifference(previous[0], gray);
        motionRef.current += MOTION_SMOOTHING * (diff - motionRef.current);
        const limit = movingRef.current ? MOTION_THRESHOLD * STILL_HYSTERESIS : MOTION_THRESHOLD;
        movingRef.current = motionRef.current > limit;
      }
      previous = [...previous, gray].slice(-COMPARE_SAMPLES_BACK);

      const next: FrameQuality = { brightness: classifyBrightness(lumaRef.current), moving: movingRef.current };
      setQuality((current) =>
        current && current.brightness === next.brightness && current.moving === next.moving ? current : next,
      );
    };

    const interval = window.setInterval(tick, SAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      previous = [];
      // Drop the last reading so a paused/resumed scan never shows stale guidance.
      setQuality(null);
    };
  }, [enabled, videoRef]);

  return enabled ? quality : null;
}
