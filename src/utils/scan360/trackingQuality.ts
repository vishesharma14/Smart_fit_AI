import type { FrameDecision } from './capture';
import type { BodyYaw } from './bodyYaw';
import type { OutlineQuality } from '../silhouette/outlineQuality';

/*
 * A plain-language summary of how well the latest frames could be used, for
 * the on-screen quality indicator. It only reports the detection results; it
 * never changes what is captured or measured.
 */

export type TrackingLevel = 'good' | 'fair' | 'poor';

export interface TrackingQuality {
  level: TrackingLevel;
  label: string;
}

export function trackingQuality(
  decision: FrameDecision | null,
  yaw: BodyYaw | null,
  outline: OutlineQuality | null,
): TrackingQuality | null {
  if (!decision) return null;
  // Body not usable at all: no / several people, out of frame, hidden joints, posture, light.
  if (decision.reason === 'pose' || decision.reason === 'lighting') return { level: 'poor', label: 'Poor' };
  const outlineOk = outline !== null && outline.issue === null;
  const angleClear = yaw !== null && yaw.confidence >= 0.7;
  if (decision.accept || (outlineOk && angleClear)) return { level: 'good', label: 'Good' };
  return { level: 'fair', label: 'Fair' };
}
