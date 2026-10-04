import { describe, expect, it } from 'vitest';
import { extractSilhouetteFrame } from './extract';
import { BODY, bodyLandmarks, renderBodyMask } from './testBody';

const S = 600 / BODY.statureCm; // default px per cm
const CX = 240;

describe('extractSilhouetteFrame', () => {
  it('finds head top, floor and crotch of the rendered body', () => {
    const frame = extractSilhouetteFrame(renderBodyMask('front'), bodyLandmarks('front'))!;
    expect(frame.headTopY).toBeCloseTo(60, 1);
    expect(frame.floorY).toBeCloseTo(660, 1);
    expect(frame.crotchY).toBeCloseTo(660 - BODY.crotchCm * S, 1);
    expect(frame.headClipped).toBe(false);
    expect(frame.floorClipped).toBe(false);
  });

  it('measures run edges with sub-pixel precision', () => {
    const frame = extractSilhouetteFrame(renderBodyMask('front'), bodyLandmarks('front'))!;
    // Chest row (130 cm above the floor): torso half-width 16 cm.
    const row = frame.rows[Math.round(660 - 130 * S)]!;
    expect(row.center!.left).toBeCloseTo(CX - 16 * S, 1);
    expect(row.center!.right).toBeCloseTo(CX + 16 * S, 1);
    expect(row.sharpness).toBeCloseTo(1, 5);
  });

  it('follows each leg separately below the crotch', () => {
    const frame = extractSilhouetteFrame(renderBodyMask('front'), bodyLandmarks('front'))!;
    const row = frame.rows[Math.round(660 - 60 * S)]!;
    expect(row.center).toBeNull();
    expect(row.leftLeg && row.rightLeg).toBeTruthy();
    expect(row.leftLeg!.left).toBeGreaterThan(row.rightLeg!.right);
  });

  it('finds no crotch side-on or with the legs together', () => {
    expect(extractSilhouetteFrame(renderBodyMask('left'), bodyLandmarks('left'))!.crotchY).toBeNull();
    const together = { legsTogether: true };
    expect(extractSilhouetteFrame(renderBodyMask('front', together), bodyLandmarks('front', together))!.crotchY).toBeNull();
  });

  it('flags a head cut off by the frame', () => {
    const options = { floorY: 590 };
    const frame = extractSilhouetteFrame(renderBodyMask('front', options), bodyLandmarks('front', options))!;
    expect(frame.headClipped).toBe(true);
    expect(frame.headTopY).toBe(0);
  });

  it('measures softer edges as less sharp', () => {
    const options = { softPx: 12 };
    const frame = extractSilhouetteFrame(renderBodyMask('front', options), bodyLandmarks('front', options))!;
    expect(frame.rows[Math.round(660 - 130 * S)]!.sharpness).toBeLessThan(0.7);
  });

  it('returns no outline from an empty mask, and null for unusable input', () => {
    const empty = { width: 480, height: 720, data: new Float32Array(480 * 720) };
    const frame = extractSilhouetteFrame(empty, bodyLandmarks('front'))!;
    expect(frame.headTopY).toBeNull();
    expect(frame.rows.every((r) => r === null)).toBe(true);
    expect(extractSilhouetteFrame({ width: 0, height: 0, data: [] }, bodyLandmarks('front'))).toBeNull();
    expect(extractSilhouetteFrame(renderBodyMask('front'), bodyLandmarks('front').slice(0, 10))).toBeNull();
    const broken = bodyLandmarks('front').map((p, i) => (i === 11 ? { ...p, x: Number.NaN } : p));
    expect(extractSilhouetteFrame(renderBodyMask('front'), broken)).toBeNull();
  });

  it('ignores a separate background blob', () => {
    const mask = renderBodyMask('front');
    // A bright object beside the person, not touching them.
    for (let y = 200; y < 400; y += 1) for (let x = 20; x < 60; x += 1) (mask.data as Float32Array)[y * 480 + x] = 1;
    const frame = extractSilhouetteFrame(mask, bodyLandmarks('front'))!;
    const row = frame.rows[Math.round(660 - 130 * S)]!;
    expect(row.center!.left).toBeCloseTo(CX - 16 * S, 1);
  });
});
