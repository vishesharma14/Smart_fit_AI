import type { ClothingType, UserInfo } from '../../types/domain';
import type { Measurement, MeasurementId, ScanMeasurementResult } from '../../types/measurement';
import type { ScanQuality, ScanQualityFactorId } from '../../types/scanQuality';
import { definitionsForRegion } from '../measurement/definitions';
import { scanRegionFor } from '../pose/scanRegions';
import { SCAN_QUALITY_WEIGHTS } from '../scanQuality/scanQuality';

/*
 * Demo Mode (Step 18): the single source of truth for the demonstration data. Everything here is FICTIONAL, fixed
 * sample data for showing the product without a camera — never measured, never random. It enters the app as an
 * ordinary scan result marked `demo: true`, so the existing review, sizing, results and profile code handle it
 * unchanged while every screen can label it as demo data.
 */

/** Shown wherever Demo Mode is active. */
export const DEMO_NOTICE = 'Using sample scan data for demonstration. No camera is used.';

/** Sample details pre-filled on the User Information step (editable). */
export const DEMO_USER_INFO: UserInfo = { name: 'Demo User', gender: 'men', age: 30, heightCm: 178, weightKg: 76 };

/** Fictional sample body measurements (cm) for every measurement the engine defines. */
export const DEMO_MEASUREMENTS_CM: Readonly<Record<MeasurementId, number>> = {
  'shoulder-width': 45,
  'arm-length': 62,
  'torso-length': 58,
  chest: 98,
  waist: 84,
  hip: 100,
  thigh: 57,
  inseam: 80,
  'leg-length': 94,
};

/** Confidence given to the sample values; outline measurements stay `uncertain`, exactly as real ones do. */
const DEMO_CONFIDENCE = { landmark: 0.9, silhouette: 0.7 } as const;

const DEMO_FACTOR_SCORES: Record<ScanQualityFactorId, { label: string; score: number }> = {
  visibility: { label: 'Body visibility', score: 96 },
  stability: { label: 'Pose stability', score: 92 },
  coverage: { label: 'View coverage', score: 100 },
  outline: { label: 'Outline quality', score: 90 },
  calibration: { label: 'Scale calibration', score: 92 },
};

/**
 * Fixed sample scan-quality summary in the real `ScanQuality` shape. The overall score is the weighted mean of the
 * sample factors with the real weights (94 → Excellent); it is not calculated from any scan.
 */
export const DEMO_SCAN_QUALITY: ScanQuality = (() => {
  const factors = (Object.keys(DEMO_FACTOR_SCORES) as ScanQualityFactorId[]).map((id) => ({
    id,
    label: DEMO_FACTOR_SCORES[id].label,
    score: DEMO_FACTOR_SCORES[id].score,
    weight: SCAN_QUALITY_WEIGHTS[id],
    detail: 'Demo sample value',
  }));
  const total = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / total);
  return { score, level: 'excellent', factors, recommendations: [], cappedBecause: null };
})();

/**
 * The demo "scan": the sample values for the garment's measurement region (the same region a real scan of that garment
 * measures), as an ordinary `ScanMeasurementResult` marked `demo: true`. Only `measuredAt` depends on the time.
 */
export function buildDemoScanResult(clothingType: ClothingType | null, now: Date = new Date()): ScanMeasurementResult {
  const region = scanRegionFor(clothingType).id;
  const measurements: Measurement[] = definitionsForRegion(region).map((definition) => {
    const base = { id: definition.id, name: definition.name, definition: definition.definition, unit: 'cm' as const };
    if (definition.kind === 'unsupported') {
      return {
        ...base,
        value: null,
        confidence: 0,
        status: 'unsupported',
        reason: definition.reason,
        source: { method: 'not-measurable', angles: [], sampleCount: 0, landmarks: [], calibration: 'none' },
      };
    }
    const silhouette = definition.kind === 'silhouette';
    return {
      ...base,
      value: DEMO_MEASUREMENTS_CM[definition.id],
      confidence: DEMO_CONFIDENCE[definition.kind],
      status: silhouette ? 'uncertain' : 'valid',
      ...(silhouette ? { reason: 'Demo sample value (outline measurements are always marked uncertain).' } : {}),
      source: {
        method: silhouette ? 'silhouette-geometry' : 'landmark-geometry',
        angles: [],
        sampleCount: 0,
        landmarks: definition.landmarks,
        calibration: 'none',
      },
    };
  });
  return {
    report: {
      region,
      measurements,
      calibration: {
        method: 'none',
        cmPerUnit: null,
        confidence: 1,
        detail: 'Demo Mode: predefined sample values in centimetres. No camera scan or calibration took place.',
      },
      anglesUsed: [],
      warnings: [],
    },
    clothingType,
    measuredAt: now.toISOString(),
    scanQuality: DEMO_SCAN_QUALITY,
    demo: true,
  };
}
