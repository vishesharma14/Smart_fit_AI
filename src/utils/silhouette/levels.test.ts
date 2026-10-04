import { describe, expect, it } from 'vitest';
import { combineSilhouetteFrames } from './combine';
import { extractSilhouetteFrame } from './extract';
import { depthAt, findFrontLevels } from './levels';
import { BODY, bodyLandmarks, renderBodyMask, type BodyOptions } from './testBody';

const S = 600 / BODY.statureCm;
const outline = (phase: 'front' | 'left', options: BodyOptions = {}) =>
  combineSilhouetteFrames([0, 1, 2].map(() => extractSilhouetteFrame(renderBodyMask(phase, options), bodyLandmarks(phase, options))))!;

describe('findFrontLevels', () => {
  it('finds chest, waist, hip and thigh widths of the rendered body', () => {
    const found = findFrontLevels(outline('front'), bodyLandmarks('front'));
    expect(found.staturePx).toBeCloseTo(600, 1);
    expect(found.levels.chest!.sizePx / S).toBeCloseTo(BODY.front.chest, 0);
    expect(found.levels.waist!.sizePx / S).toBeCloseTo(BODY.front.waist, 0);
    expect(found.levels.hip!.sizePx / S).toBeCloseTo(BODY.front.hip, 0);
    expect(found.levels.thigh!.sizePx / S).toBeCloseTo(BODY.front.thigh, 0);
    expect(found.failures).toEqual({});
  });

  it('orders the levels top to bottom', () => {
    const { levels } = findFrontLevels(outline('front'), bodyLandmarks('front'));
    expect(levels.chest!.heightFraction).toBeGreaterThan(levels.waist!.heightFraction);
    expect(levels.waist!.heightFraction).toBeGreaterThan(levels.hip!.heightFraction);
    expect(levels.hip!.heightFraction).toBeGreaterThan(levels.thigh!.heightFraction);
  });

  it('refuses the chest when the arms touch the body', () => {
    const options = { armsTouching: true };
    const found = findFrontLevels(outline('front', options), bodyLandmarks('front', options));
    expect(found.levels.chest).toBeUndefined();
    expect(found.failures.chest).toBe('arms-touching');
  });

  it('has no thigh without a visible crotch', () => {
    const options = { legsTogether: true };
    const found = findFrontLevels(outline('front', options), bodyLandmarks('front', options));
    expect(found.failures.thigh).toBe('no-crotch');
  });

  it('reports every level as missing without an outline', () => {
    const empty = { ...outline('front'), headTopY: null };
    expect(findFrontLevels(empty, bodyLandmarks('front')).failures).toEqual({
      chest: 'no-outline',
      waist: 'no-outline',
      hip: 'no-outline',
      thigh: 'no-outline',
    });
  });
});

describe('depthAt', () => {
  it('reads the side depth at a height fraction', () => {
    const side = outline('left');
    expect(depthAt(side, 130 / BODY.statureCm)!.sizePx / S).toBeCloseTo(BODY.side.chest, 0);
    expect(depthAt(side, 106 / BODY.statureCm)!.sizePx / S).toBeCloseTo(BODY.side.waist, 0);
    expect(depthAt(side, 90 / BODY.statureCm)!.sizePx / S).toBeCloseTo(BODY.side.hip, 0);
  });

  it('is null without an outline or for an invalid height', () => {
    expect(depthAt({ ...outline('left'), floorY: null }, 0.5)).toBeNull();
    expect(depthAt(outline('left'), Number.NaN)).toBeNull();
    expect(depthAt(outline('left'), 1.5)).toBeNull();
  });
});
