/*
 * Loader for the compact Anny body-model export (`public/models/anny/anny-compact-v1.bin`,
 * produced by tools/anny-export/export_anny_compact.py). Shadow-mode only (Step 9E-2).
 *
 * Layout: "ANNY" · uint32 header length · header JSON · arrays (8-byte aligned, little-endian),
 * each described in the header by name, dtype, offset (from the end of the header) and length.
 */

export const ANNY_JOINTS = [
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
  'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
] as const;
export type AnnyJoint = (typeof ANNY_JOINTS)[number];

export interface AnnyCompactModel {
  vertexCount: number;
  faceCount: number;
  /** Number of shape components (coefficients are in standard-deviation units). */
  components: number;
  /** Values per shape vector: vertices (x, y, z) followed by the joints (x, y, z). Metres, z up, front = −y. */
  stride: number;
  mean: Float32Array;
  /** components × stride, row-major. */
  basis: Float32Array;
  /** Standard deviation of each component over the sampled bodies. */
  sd: Float32Array;
  faces: Uint16Array;
  armMask: Uint8Array;
  leftLegMask: Uint8Array;
  rightLegMask: Uint8Array;
  /** Anny's waist vertex loop (its own anthropometry definition). */
  waistLoop: Uint16Array;
  crotchVertex: number;
  explainedVariance: number;
  provenance: Record<string, unknown>;
  byteLength: number;
}

interface ArrayEntry {
  name: string;
  dtype: string;
  offset: number;
  length: number;
}

const DTYPE_BYTES: Record<string, number> = { float32: 4, float16: 2, uint16: 2, uint8: 1 };

/** IEEE 754 half → float. */
export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exponent = (h >> 10) & 0x1f;
  const fraction = h & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

export function parseAnnyCompact(buffer: ArrayBuffer): AnnyCompactModel {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'ANNY') throw new Error('Not an Anny compact model file.');
  const headerLength = new DataView(buffer).getUint32(4, true);
  if (8 + headerLength > bytes.length) throw new Error('Anny model header is truncated.');
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as {
    format: string;
    version: number;
    vertexCount: number;
    faceCount: number;
    components: number;
    joints: string[];
    crotchVertex: number;
    explainedVariance: number;
    provenance: Record<string, unknown>;
    arrays: ArrayEntry[];
  };
  if (header.format !== 'sizerai-anny-compact' || header.version !== 1) throw new Error('Unsupported Anny model format.');
  if (header.joints.join() !== ANNY_JOINTS.join()) throw new Error('Unexpected Anny joint list.');
  const base = 8 + headerLength;
  const view = new DataView(buffer);
  const read = (name: string): Float32Array | Uint16Array | Uint8Array => {
    const entry = header.arrays.find((a) => a.name === name);
    if (!entry || !DTYPE_BYTES[entry.dtype]) throw new Error(`Anny model array "${name}" is missing.`);
    const start = base + entry.offset;
    if (start + entry.length * DTYPE_BYTES[entry.dtype] > bytes.length) throw new Error(`Anny model array "${name}" is truncated.`);
    switch (entry.dtype) {
      case 'float32': {
        const out = new Float32Array(entry.length);
        for (let i = 0; i < entry.length; i += 1) out[i] = view.getFloat32(start + 4 * i, true);
        return out;
      }
      case 'float16': {
        const out = new Float32Array(entry.length);
        for (let i = 0; i < entry.length; i += 1) out[i] = halfToFloat(view.getUint16(start + 2 * i, true));
        return out;
      }
      case 'uint16': {
        const out = new Uint16Array(entry.length);
        for (let i = 0; i < entry.length; i += 1) out[i] = view.getUint16(start + 2 * i, true);
        return out;
      }
      default:
        return bytes.slice(start, start + entry.length);
    }
  };
  const V = header.vertexCount;
  const stride = 3 * (V + ANNY_JOINTS.length);
  const model: AnnyCompactModel = {
    vertexCount: V,
    faceCount: header.faceCount,
    components: header.components,
    stride,
    mean: read('mean') as Float32Array,
    basis: read('basis') as Float32Array,
    sd: read('sd') as Float32Array,
    faces: read('faces') as Uint16Array,
    armMask: read('armMask') as Uint8Array,
    leftLegMask: read('leftLegMask') as Uint8Array,
    rightLegMask: read('rightLegMask') as Uint8Array,
    waistLoop: read('waistLoop') as Uint16Array,
    crotchVertex: header.crotchVertex,
    explainedVariance: header.explainedVariance,
    provenance: header.provenance,
    byteLength: buffer.byteLength,
  };
  if (
    model.mean.length !== stride ||
    model.basis.length !== stride * model.components ||
    model.sd.length !== model.components ||
    model.faces.length !== 3 * model.faceCount ||
    model.armMask.length !== V
  ) {
    throw new Error('Anny model arrays have inconsistent sizes.');
  }
  return model;
}
