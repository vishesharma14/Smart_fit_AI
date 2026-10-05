import { useCallback, useEffect, useRef } from 'react';
import type { PoseStats } from '../../../hooks/usePoseScan';
import type { ScanSessionStatus } from '../../../types/scan';

/*
 * Developer validation only: measures how the device copes with a scan — scan start → finish time and the pose
 * model's detection rate / time per frame while scanning — without touching the scan itself. Values are read when
 * an attempt is recorded; nothing here affects detection or capture.
 */

export interface MeasuredPerformance {
  scanDurationMs: number | null;
  meanDetectionsPerSecond: number | null;
  minDetectionsPerSecond: number | null;
  meanInferenceMs: number | null;
}

/** Samples taken in the first moments of a scan only show the model warming up. */
const WARM_UP_MS = 2000;
const SAMPLE_INTERVAL_MS = 1000;

const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

export function useScanPerformance(status: ScanSessionStatus, stats: PoseStats | null): () => MeasuredPerformance {
  const track = useRef({ startedAt: null as number | null, finishedAt: null as number | null, lastSample: 0, dps: [] as number[], inference: [] as number[] });

  useEffect(() => {
    const t = track.current;
    const now = performance.now();
    if (status === 'ready') {
      track.current = { startedAt: null, finishedAt: null, lastSample: 0, dps: [], inference: [] };
    } else if (status === 'scanning' && t.startedAt === null) {
      t.startedAt = now;
    } else if (status === 'finished' && t.finishedAt === null && t.startedAt !== null) {
      t.finishedAt = now;
    }
  }, [status]);

  useEffect(() => {
    const t = track.current;
    if (status !== 'scanning' || !stats || t.startedAt === null) return;
    const now = performance.now();
    if (now - t.startedAt < WARM_UP_MS || now - t.lastSample < SAMPLE_INTERVAL_MS) return;
    t.lastSample = now;
    if (Number.isFinite(stats.detectionsPerSecond)) t.dps.push(stats.detectionsPerSecond);
    if (Number.isFinite(stats.inferenceMs)) t.inference.push(stats.inferenceMs);
  }, [status, stats]);

  return useCallback(() => {
    const t = track.current;
    return {
      scanDurationMs: t.startedAt !== null && t.finishedAt !== null ? t.finishedAt - t.startedAt : null,
      meanDetectionsPerSecond: average(t.dps),
      minDetectionsPerSecond: t.dps.length ? Math.min(...t.dps) : null,
      meanInferenceMs: average(t.inference),
    };
  }, []);
}
