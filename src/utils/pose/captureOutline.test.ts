import { describe, expect, it } from 'vitest';
import { makeCapture, makeSilhouetteCapture } from '../measurement/testFixtures';
import { combineSilhouetteFrames } from '../silhouette/combine';
import { POSE_SCAN_CONFIG } from './poseConfig';
import { buildCaptureFromHold, stepHold, HOLD_RESET, type HoldState, type ValidatedSample } from './poseValidation';

// The body outline rides along with validated frames but never decides whether an angle is captured.
function hold(samples: ValidatedSample[]): HoldState {
  return samples.reduce((state, sample) => stepHold(state, true, sample.time), HOLD_RESET);
}

function samples(silhouette: ValidatedSample['silhouette']): ValidatedSample[] {
  const base = makeCapture('front');
  return Array.from({ length: POSE_SCAN_CONFIG.captureMinFrames + 2 }, (_, i) => ({
    time: i * 150,
    landmarks: base.landmarks,
    worldLandmarks: base.worldLandmarks,
    silhouette,
  }));
}

describe('capture with or without a body outline', () => {
  const outline = makeSilhouetteCapture('front').silhouette!;
  const now = 150 * (POSE_SCAN_CONFIG.captureMinFrames + 2);

  it('captures exactly the same landmarks whether the outline is good, missing or unusable', () => {
    const good = samples(outline);
    const missing = samples(null);
    const unusable = samples({ ...outline, headTopY: null, floorY: null });
    const a = buildCaptureFromHold(hold(good), good, now);
    expect(a).not.toBeNull();
    expect(buildCaptureFromHold(hold(missing), missing, now)).toEqual(a);
    expect(buildCaptureFromHold(hold(unusable), unusable, now)).toEqual(a);
  });

  it('leaves the capture without an outline when the frames have none', () => {
    expect(combineSilhouetteFrames(samples(null).map((s) => s.silhouette))).toBeNull();
    expect(combineSilhouetteFrames(samples({ ...outline, headTopY: null }).map((s) => s.silhouette))).toBeNull();
  });

  it('still refuses an invalid hold regardless of the outline', () => {
    const short = samples(outline).slice(0, 3);
    expect(buildCaptureFromHold(hold(short), short, 450)).toBeNull();
  });
});
