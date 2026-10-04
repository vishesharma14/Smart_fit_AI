import type { AnnyCompactModel } from './format';
import { distance3, joint, vertex, verticalExtent } from './model';
import { sliceCircumference, type TriangleFilter } from './slice';

/*
 * Measurements on a fitted Anny body (shadow mode). Every definition here is SizerAI's own working
 * definition on the Anny mesh and still needs anthropometric validation against tape measurements
 * (ISO 8559-1 landmarks) before any of it could be trusted.
 */

export type ShadowMeasurementId =
  | 'waist'
  | 'chest'
  | 'hip'
  | 'thigh'
  | 'inseam'
  | 'shoulder-width'
  | 'arm-length'
  | 'leg-length';

export interface ShadowMeasurement {
  id: ShadowMeasurementId;
  label: string;
  /** Centimetres; null when it could not be taken. */
  valueCm: number | null;
  /** How it is taken on the mesh. */
  definition: string;
  /** Always true in shadow mode: no definition has been validated against tape measurements yet. */
  needsValidation: true;
}

const SAMPLES = 9;

/** Largest tape-like circumference in a height band (metres), or null when every slice is empty. */
function maxCircumference(model: AnnyCompactModel, shape: Float32Array, z0: number, z1: number, filter: TriangleFilter): number | null {
  let best = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const z = z0 + ((z1 - z0) * i) / (SAMPLES - 1);
    best = Math.max(best, sliceCircumference(model, shape, z, filter));
  }
  return best > 0 ? best : null;
}

const cm = (metres: number | null): number | null => (metres === null || !Number.isFinite(metres) ? null : Math.round(metres * 1000) / 10);

export function measureAnnyBody(model: AnnyCompactModel, shape: Float32Array): ShadowMeasurement[] {
  const ext = verticalExtent(model, shape);
  const stature = ext.max - ext.min;
  const j = (name: Parameters<typeof joint>[2]) => joint(model, shape, name);
  const shoulderZ = (j('shoulderL')[2] + j('shoulderR')[2]) / 2;
  const hipZ = (j('hipL')[2] + j('hipR')[2]) / 2;
  const torso = shoulderZ - hipZ;
  const crotchZ = vertex(shape, model.crotchVertex)[2];

  let waist = 0;
  const loop = model.waistLoop;
  for (let i = 0; i < loop.length; i += 1) waist += distance3(vertex(shape, loop[i]), vertex(shape, loop[(i + 1) % loop.length]));

  const chest = maxCircumference(model, shape, shoulderZ - 0.36 * torso, shoulderZ - 0.22 * torso, 'torso');
  const hip = maxCircumference(model, shape, crotchZ + 0.01, hipZ + 0.1 * torso, 'torso');
  const thighBand = (filter: TriangleFilter) => maxCircumference(model, shape, crotchZ - 0.08 * stature, crotchZ - 0.02 * stature, filter);
  const thighs = [thighBand('leftLeg'), thighBand('rightLeg')].filter((v): v is number => v !== null);
  const thigh = thighs.length ? thighs.reduce((s, v) => s + v, 0) / thighs.length : null;
  const sides = (a: [Parameters<typeof joint>[2], Parameters<typeof joint>[2], Parameters<typeof joint>[2]][]) =>
    a.reduce((s, [p, q, r]) => s + distance3(j(p), j(q)) + distance3(j(q), j(r)), 0) / a.length;

  const m = (id: ShadowMeasurementId, label: string, valueM: number | null, definition: string): ShadowMeasurement => ({
    id,
    label,
    valueCm: cm(valueM),
    definition,
    needsValidation: true,
  });
  return [
    m('chest', 'Chest', chest, 'Largest tape-like (convex hull) torso circumference 22–36% of the shoulder→hip-joint distance below the shoulder joints, arms excluded.'),
    m('waist', 'Waist', waist, "Length of Anny's own waist vertex loop (Anny anthropometry definition)."),
    m('hip', 'Hip', hip, 'Largest tape-like torso circumference from just above the crotch up to 10% of the torso length above the hip joints.'),
    m('thigh', 'Thigh', thigh, 'Largest tape-like circumference of each leg 2–8% of stature below the crotch, averaged over both legs.'),
    m('inseam', 'Inseam', crotchZ - ext.min, 'Crotch vertex height above the lowest point of the feet.'),
    m('shoulder-width', 'Shoulder width', distance3(j('shoulderL'), j('shoulderR')), 'Distance between the shoulder joint centres (Anny upper-arm bone heads).'),
    m('arm-length', 'Arm length', sides([['shoulderL', 'elbowL', 'wristL'], ['shoulderR', 'elbowR', 'wristR']]), 'Shoulder → elbow → wrist joint centres, averaged over both arms.'),
    m('leg-length', 'Leg length', sides([['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']]), 'Hip → knee → ankle joint centres, averaged over both legs.'),
  ];
}
