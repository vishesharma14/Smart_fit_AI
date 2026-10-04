import modelDataUrl from '../../../public/models/anny/anny-compact-v1.bin?inline';
import type { AnnyFitInput } from './fit';
import { parseAnnyCompact, type AnnyCompactModel } from './format';
import { evaluateShape, verticalExtent } from './model';
import { ANNY_FIT_FRACTIONS } from './scanInput';
import { widthProfile } from './slice';

/** Test-only: the real compact model file, inlined by Vite and parsed once. */
let cached: AnnyCompactModel | null = null;

export function modelBuffer(): ArrayBuffer {
  const base64 = modelDataUrl.slice(modelDataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function testModel(): AnnyCompactModel {
  cached ??= parseAnnyCompact(modelBuffer());
  return cached;
}

/** Observed widths rendered from a known Anny body (test-only stand-in for scan outlines). */
export function inputFromShape(model: AnnyCompactModel, coeffs: number[], yaws = [0, 90, 180], noise = 0): AnnyFitInput {
  const shape = evaluateShape(model, coeffs);
  const profile = widthProfile(model, shape, yaws, ANNY_FIT_FRACTIONS);
  const ext = verticalExtent(model, shape);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  return {
    heightM: ext.max - ext.min,
    fractions: ANNY_FIT_FRACTIONS,
    views: yaws.map((yawDeg, v) => ({
      yawDeg,
      widths: Array.from(profile.views[v].widths, (w) => (Number.isFinite(w) ? w * (1 + noise * rnd()) : null)),
    })),
  };
}

