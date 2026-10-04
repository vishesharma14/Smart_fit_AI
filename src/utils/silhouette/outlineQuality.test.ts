import { describe, expect, it } from 'vitest';
import { extractSilhouetteFrame } from './extract';
import { assessOutlineFrame, jointStaturePx } from './outlineQuality';
import { bodyLandmarks, renderBodyMask, type BodyOptions } from './testBody';

const frame = (options: BodyOptions = {}) => extractSilhouetteFrame(renderBodyMask('front', options), bodyLandmarks('front', options));

describe('assessOutlineFrame', () => {
  it('accepts a clear full-body outline', () => {
    const quality = assessOutlineFrame(frame(), bodyLandmarks('front'));
    expect(quality.issue).toBeNull();
    expect(quality.staturePx).toBeCloseTo(600, 0);
  });

  it('rejects a missing outline', () => {
    expect(assessOutlineFrame(null, bodyLandmarks('front')).issue).toBe('no-outline');
    expect(assessOutlineFrame({ ...frame()!, floorY: null }, bodyLandmarks('front')).issue).toBe('no-outline');
  });

  it('rejects a head or feet cut off by the frame', () => {
    expect(assessOutlineFrame(frame({ floorY: 590 }), bodyLandmarks('front', { floorY: 590 })).issue).toBe('head-cut');
    expect(assessOutlineFrame(frame({ floorY: 740 }), bodyLandmarks('front', { floorY: 740 })).issue).toBe('feet-cut');
  });

  it('rejects an outline whose height disagrees with the joints (calibration would be wrong)', () => {
    const f = frame()!;
    expect(assessOutlineFrame({ ...f, headTopY: f.headTopY! - 200 }, bodyLandmarks('front')).issue).toBe('height-mismatch');
  });

  it('rejects blurred edges', () => {
    expect(assessOutlineFrame(frame({ softPx: 30 }), bodyLandmarks('front', { softPx: 30 })).issue).toBe('soft-edges');
  });
});

describe('jointStaturePx', () => {
  it('estimates head top to heels from the joints, or null when it can’t', () => {
    expect(jointStaturePx(bodyLandmarks('front'), 720)).toBeGreaterThan(500);
    expect(jointStaturePx([], 720)).toBeNull();
  });
});
