import { describe, expect, it } from 'vitest';
import type { OrientationEstimate } from '../pose/poseOrientation';
import { bodyYawForScan, estimateBodyYaw } from './bodyYaw';

/** Only the three signals the angle uses matter; the rest is filler. */
function orientation(relativeWidth: number, frontness: number, facing: number): OrientationEstimate {
  return {
    view: 'turning',
    orientation: null,
    widthRatio: relativeWidth * 0.65,
    relativeWidth,
    frontness,
    facing,
    worldYawDeg: 0,
    confidence: 0,
    signals: {},
    cues: { face: true, shoulders: true, feet: true },
  };
}

const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);

describe('estimateBodyYaw', () => {
  it('classifies the eight orientations from width, front/back and side votes', () => {
    const cases: [number, number, number, number][] = [
      // [relative width, frontness, facing, expected angle]
      [1, 0.8, 0, 0],
      [cos(45), 0.6, 0.6, 45],
      [cos(90), 0, 0.8, 90],
      [cos(45), -0.6, 0.6, 135],
      [1, -0.8, 0, 180],
      [cos(45), -0.6, -0.6, 225],
      [cos(90), 0, -0.8, 270],
      [cos(45), 0.6, -0.6, 315],
    ];
    for (const [width, front, side, expected] of cases) {
      const yaw = estimateBodyYaw(orientation(width, front, side))!;
      expect(Math.min(Math.abs(yaw.yawDeg - expected), 360 - Math.abs(yaw.yawDeg - expected))).toBeLessThan(1);
      expect(yaw.confidence).toBeGreaterThan(0.9);
    }
  });

  it('treats a wider-than-calibrated frame as frontal', () => {
    expect(estimateBodyYaw(orientation(1.2, 0.7, 0.3))!.yawDeg).toBe(0);
  });

  it('is unsure facing the camera when front vs back is undecided', () => {
    expect(estimateBodyYaw(orientation(0.98, 0.05, 0))!.confidence).toBeLessThan(0.5);
  });

  it('is unsure side-on when the turning direction is undecided', () => {
    expect(estimateBodyYaw(orientation(0.05, 0, 0.05))!.confidence).toBeLessThan(0.5);
  });

  it('does not need the side vote when facing the camera, nor the front vote when side-on', () => {
    expect(estimateBodyYaw(orientation(1, 0.8, 0))!.confidence).toBeGreaterThan(0.9);
    expect(estimateBodyYaw(orientation(0, 0, 0.8))!.confidence).toBeGreaterThan(0.9);
  });

  it('returns null for unusable signals', () => {
    expect(estimateBodyYaw(orientation(Number.NaN, 0.5, 0.5))).toBeNull();
  });
});

describe('bodyYawForScan', () => {
  it('takes the classified front as 0° before calibration (proportions vary from person to person)', () => {
    // A narrow-shouldered person facing the camera reads as ~38° from the default width ratio.
    const facing = { ...orientation(0.79, 0.3, 0.1), orientation: 'front' as const };
    expect(estimateBodyYaw(facing)!.yawDeg).toBeGreaterThan(30);
    expect(bodyYawForScan(facing, false)).toEqual({ yawDeg: 0, confidence: 1 });
  });

  it('uses the calibrated width-based angle once the front view is captured', () => {
    const turned = { ...orientation(cos(45), 0.6, 0.6), orientation: null };
    expect(bodyYawForScan(turned, true)!.yawDeg).toBeCloseTo(45, 0);
    expect(bodyYawForScan({ ...turned, orientation: 'front' }, true)!.yawDeg).toBeCloseTo(45, 0);
  });
});
