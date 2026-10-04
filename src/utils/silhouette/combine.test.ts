import { describe, expect, it } from 'vitest';
import type { SilhouetteFrame } from '../../types/silhouette';
import { combineSilhouetteFrames, median } from './combine';
import { extractSilhouetteFrame } from './extract';
import { BODY, bodyLandmarks, renderBodyMask, type BodyOptions } from './testBody';

const S = 600 / BODY.statureCm;
const CHEST_ROW = Math.round(660 - 130 * S);
const frameOf = (options: BodyOptions = {}) => extractSilhouetteFrame(renderBodyMask('front', options), bodyLandmarks('front', options))!;
const chestWidth = (frame: SilhouetteFrame) => frame.rows[CHEST_ROW]!.center!.right - frame.rows[CHEST_ROW]!.center!.left;

describe('median', () => {
  it('is the middle value (mean of the middle two for even counts)', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('combineSilhouetteFrames', () => {
  it('keeps the per-row median, so one outlier frame does not move the outline', () => {
    const normal = frameOf();
    const outlier = frameOf({ torsoScale: 1.4 });
    const profile = combineSilhouetteFrames([normal, outlier, normal, normal])!;
    expect(chestWidth(profile)).toBeCloseTo(chestWidth(normal), 6);
    expect(profile.frameCount).toBe(4);
  });

  it('reports steadiness: 0 for identical frames, higher when widths vary', () => {
    expect(combineSilhouetteFrames([frameOf(), frameOf(), frameOf()])!.widthJitter).toBe(0);
    const varying = combineSilhouetteFrames([frameOf({ torsoScale: 0.95 }), frameOf(), frameOf({ torsoScale: 1.05 })])!;
    expect(varying.widthJitter).toBeGreaterThan(0);
  });

  it('needs enough frames with an outline', () => {
    expect(combineSilhouetteFrames([frameOf(), frameOf()])).toBeNull();
    expect(combineSilhouetteFrames([frameOf(), null, undefined, frameOf()])).toBeNull();
    expect(combineSilhouetteFrames([])).toBeNull();
  });

  it('drops frames of a different mask size', () => {
    const other = frameOf({ width: 400 });
    expect(combineSilhouetteFrames([frameOf(), frameOf(), other])).toBeNull();
    expect(combineSilhouetteFrames([frameOf(), frameOf(), frameOf(), other])!.frameCount).toBe(3);
  });

  it('keeps the crotch only when most frames show it', () => {
    const apart = frameOf();
    const together = frameOf({ legsTogether: true });
    expect(combineSilhouetteFrames([apart, apart, together])!.crotchY).not.toBeNull();
    expect(combineSilhouetteFrames([apart, together, together])!.crotchY).toBeNull();
  });
});
