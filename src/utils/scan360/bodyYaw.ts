import type { OrientationEstimate } from '../pose/poseOrientation';
import { wrapDeg } from './views';

/*
 * Continuous body angle from the existing orientation signals (no timers).
 *
 * - How far the body is turned (0° … 90°) comes from the projected shoulder
 *   width relative to this person's frontal width (|cos angle|), calibrated
 *   by the front view.
 * - Which half (facing toward / away from the camera) comes from the
 *   front/back votes (face, nose and toe depth, 3D torso direction, labels).
 * - Which side (turned left / right) comes from the side votes (nose and toe
 *   direction, 3D torso direction).
 *
 * Each sign only matters where it is reliable: front vs back decides little
 * when side-on, and left vs right decides little when facing the camera, so
 * the confidence weighs each vote by how much it changes the angle.
 */

export interface BodyYaw {
  /** 0 facing the camera, 90 turned left (side-on), 180 back, 270 turned right. */
  yawDeg: number;
  /** 0–1: how clearly the signals decide the angle. */
  confidence: number;
}

/** Votes at or beyond this strength count as fully decided (the orientation classifier decides at 0.25). */
const DECISIVE_VOTE = 0.35;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function estimateBodyYaw(orientation: OrientationEstimate): BodyYaw | null {
  const { relativeWidth, frontness, facing } = orientation;
  if (![relativeWidth, frontness, facing].every(Number.isFinite)) return null;
  // Turn away from frontal, 0–90°.
  const turn = (Math.acos(clamp01(relativeWidth)) * 180) / Math.PI;
  const towardCamera = frontness >= 0;
  const turnedLeft = facing >= 0;
  const yawDeg = towardCamera ? (turnedLeft ? turn : 360 - turn) : turnedLeft ? 180 - turn : 180 + turn;

  const rad = (turn * Math.PI) / 180;
  // A front/back mix-up moves the angle by 180 − 2·turn (large near frontal); a side mix-up by 2·turn (large side-on).
  const frontDoubt = Math.cos(rad) * (1 - clamp01(Math.abs(frontness) / DECISIVE_VOTE));
  const sideDoubt = Math.sin(rad) * (1 - clamp01(Math.abs(facing) / DECISIVE_VOTE));
  return { yawDeg: wrapDeg(yawDeg), confidence: clamp01(1 - Math.max(frontDoubt, sideDoubt)) };
}

/**
 * Body angle for the scan. Until the front view is captured, the width-based angle isn't calibrated to this person
 * (shoulder-to-torso proportions vary), so the front is recognised by the orientation classifier instead (frontal
 * width, front votes and 3D torso direction all agreeing) and defines 0°. Other angles are reported as estimated
 * (they can't count before the front anyway).
 */
export function bodyYawForScan(orientation: OrientationEstimate, frontCalibrated: boolean): BodyYaw | null {
  if (!frontCalibrated && orientation.orientation === 'front') return { yawDeg: 0, confidence: 1 };
  return estimateBodyYaw(orientation);
}
