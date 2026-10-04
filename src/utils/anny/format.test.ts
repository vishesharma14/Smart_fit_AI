import { describe, expect, it } from 'vitest';
import { halfToFloat, parseAnnyCompact } from './format';
import { modelBuffer, testModel } from './testModel';

describe('compact Anny model loading', () => {
  it('parses the exported file with consistent arrays', () => {
    const model = testModel();
    expect(model.vertexCount).toBe(13718);
    expect(model.faceCount).toBe(27420);
    expect(model.components).toBe(20);
    expect(model.mean).toHaveLength(model.stride);
    expect(model.basis).toHaveLength(model.stride * model.components);
    expect(model.explainedVariance).toBeGreaterThan(0.999);
    expect(model.waistLoop.length).toBeGreaterThan(10);
    expect(model.armMask.reduce((s, v) => s + v, 0)).toBeGreaterThan(1000);
    expect(String(model.provenance.anny)).toContain('d6fc027');
  });

  it('decodes float16 values', () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x3555)).toBeCloseTo(1 / 3, 3);
    expect(halfToFloat(0)).toBe(0);
  });

  it('rejects files that are not a valid export', () => {
    expect(() => parseAnnyCompact(new ArrayBuffer(4))).toThrow();
    expect(() => parseAnnyCompact(new TextEncoder().encode('NOPE\0\0\0\0').buffer)).toThrow(/Not an Anny/);
    const truncated = modelBuffer().slice(0, 100000);
    expect(() => parseAnnyCompact(truncated)).toThrow(/truncated/);
  });
});
