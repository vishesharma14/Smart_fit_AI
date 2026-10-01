import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural, gender-neutral reference mannequin.
 *
 * Each body part is a "loft": a stack of elliptical cross-sections, smoothed
 * with Catmull-Rom interpolation, closed with caps and triangulated into a
 * smooth surface. Proportions follow a generic adult figure ~7.5 heads tall.
 * It is a fixed reference shape — never fitted to, or derived from, the
 * user's camera image.
 *
 * Profiles are authored in "sketch units" (y down, ≈38 at the crown to ≈383
 * at the soles, x to the figure's left, z toward the viewer) and converted to
 * scene units with the floor at y = 0.
 */

const UNIT = 0.01;
const FLOOR_SKETCH_Y = 383;

interface Station {
  y: number;
  /** Cross-section centre. */
  x?: number;
  z?: number;
  /** Half-width (left–right). */
  rx: number;
  /** Half-depth toward the front and toward the back. */
  rzf: number;
  rzb: number;
}

type FullStation = Required<Station>;

interface LoftSpec {
  stations: Station[];
  /** Points around each cross-section. */
  around: number;
  /** Target vertical distance between cross-sections (sketch units). */
  spacing: number;
}

// ---------------------------------------------------------------- profiles

function headStations(): Station[] {
  const cy = 62;
  const ry = 24;
  const stations: Station[] = [];
  const rings = 14;
  for (let i = 0; i <= rings; i += 1) {
    const phi = (i / rings) * Math.PI;
    const y = cy - ry * Math.cos(phi);
    const r = Math.max(Math.sin(phi), 0.04);
    // Slightly narrower, forward-set jaw and a rounder back of the skull.
    const jaw = y > cy ? 1 - 0.24 * ((y - cy) / ry) : 1;
    stations.push({ y, z: 2.5, rx: 15 * r * jaw, rzf: 18 * r * jaw, rzb: 17.5 * r });
  }
  return stations;
}

const NECK: Station[] = [
  { y: 78, z: 1.5, rx: 7, rzf: 6.5, rzb: 7.5 },
  { y: 90, z: 0.5, rx: 7.6, rzf: 7.2, rzb: 8 },
  { y: 102, z: -0.5, rx: 9, rzf: 8.5, rzb: 9 },
];

const TORSO: Station[] = [
  { y: 96, z: -1, rx: 8, rzf: 7.5, rzb: 8 },
  { y: 101, z: -1.5, rx: 21, rzf: 10, rzb: 11 },
  { y: 107, z: -1.5, rx: 33, rzf: 13, rzb: 14 },
  { y: 116, z: -1, rx: 36, rzf: 16.5, rzb: 16 },
  { y: 128, rx: 33, rzf: 20, rzb: 16 },
  { y: 141, rx: 31.5, rzf: 20, rzb: 15.5 },
  { y: 154, rx: 29, rzf: 17, rzb: 14.5 },
  { y: 167, z: 0.5, rx: 26.5, rzf: 15, rzb: 13.5 },
  { y: 180, z: 0.5, rx: 28, rzf: 15.5, rzb: 15 },
  { y: 194, rx: 32, rzf: 15.5, rzb: 18.5 },
  { y: 205, z: -1, rx: 31.8, rzf: 14.5, rzb: 20 },
  { y: 213, z: -1.5, rx: 29.2, rzf: 12, rzb: 17 },
  { y: 220, z: -1.5, rx: 22, rzf: 8.5, rzb: 12 },
  { y: 225, z: -1.5, rx: 10, rzf: 4.5, rzb: 6 },
];

/** Figure's left arm (positive x), relaxed slightly away from the body. */
const ARM: Station[] = [
  { y: 103, x: 32, rx: 5, rzf: 5.5, rzb: 5.5 },
  { y: 107, x: 36, rx: 8, rzf: 8.2, rzb: 8.2 },
  { y: 118, x: 40, rx: 8.6, rzf: 8.4, rzb: 8.4 },
  { y: 145, x: 43.5, rx: 7.2, rzf: 7.2, rzb: 7.2 },
  { y: 171, x: 47, rx: 5.8, rzf: 5.9, rzb: 6.1 },
  { y: 191, x: 50, rx: 6.1, rzf: 6.5, rzb: 6.2 },
  { y: 217, x: 53, rx: 4.6, rzf: 4.9, rzb: 4.9 },
  { y: 231, x: 54.5, rx: 3.6, rzf: 4.2, rzb: 4.2 },
];

/** Relaxed hand, palm toward the thigh: thin left–right, wider front–back. */
const HAND: Station[] = [
  { y: 240, x: 55.2, rx: 3.6, rzf: 6, rzb: 5.4 },
  { y: 251, x: 55.8, rx: 3.2, rzf: 5.8, rzb: 4.6 },
  { y: 261, x: 56, rx: 2.5, rzf: 4.2, rzb: 3.2 },
  { y: 268, x: 56, rx: 1.2, rzf: 2, rzb: 1.4 },
];

/** Figure's left leg (positive x). */
const LEG: Station[] = [
  { y: 199, x: 15, rx: 13.5, rzf: 11.5, rzb: 14.5 },
  { y: 214, x: 16.4, rx: 16.8, rzf: 14, rzb: 17.5 },
  { y: 236, x: 16, rx: 13.8, rzf: 13.2, rzb: 14.2 },
  { y: 262, x: 16.8, rx: 11.6, rzf: 11.2, rzb: 11.4 },
  { y: 286, x: 17.3, rx: 9.2, rzf: 9.4, rzb: 9 },
  { y: 300, x: 17.6, rx: 8.4, rzf: 9, rzb: 8.4 },
  { y: 318, x: 17.8, rx: 8.8, rzf: 8, rzb: 10.6 },
  { y: 342, x: 18, rx: 6.6, rzf: 6.4, rzb: 7.4 },
];

/** Foot pointing forward, heel slightly behind the ankle. */
const FOOT: Station[] = [
  { y: 360, x: 18, rx: 4.8, rzf: 5, rzb: 5.2 },
  { y: 369, x: 18.4, z: 2.5, rx: 5.6, rzf: 9.5, rzb: 6 },
  { y: 377, x: 18.8, z: 4.5, rx: 6, rzf: 13.5, rzb: 6.4 },
  { y: 382, x: 19, z: 5, rx: 5, rzf: 12.5, rzb: 5.6 },
];

const mirrorX = (stations: Station[]): Station[] => stations.map((s) => ({ ...s, x: -(s.x ?? 0) }));

/** Limbs are single continuous surfaces, so there are no seams at the wrists or ankles. */
const ARM_AND_HAND = [...ARM, ...HAND];
const LEG_AND_FOOT = [...LEG, ...FOOT];

// ---------------------------------------------------------------- lofting

function full(s: Station): FullStation {
  return { x: 0, z: 0, ...s };
}

/** Uniform Catmull-Rom on each scalar of the station. */
function catmullRom(p0: FullStation, p1: FullStation, p2: FullStation, p3: FullStation, t: number): FullStation {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  const keys = ['y', 'x', 'z', 'rx', 'rzf', 'rzb'] as const;
  const out = {} as FullStation;
  for (const key of keys) out[key] = f(p0[key], p1[key], p2[key], p3[key]);
  // Radii must stay positive even where the spline overshoots.
  out.rx = Math.max(out.rx, 0.2);
  out.rzf = Math.max(out.rzf, 0.2);
  out.rzb = Math.max(out.rzb, 0.2);
  return out;
}

function sampleSections(stations: Station[], spacing: number): FullStation[] {
  const pts = stations.map(full);
  const out: FullStation[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const steps = Math.max(1, Math.round(Math.abs(p2.y - p1.y) / spacing));
    for (let s = 0; s < steps; s += 1) out.push(catmullRom(p0, p1, p2, p3, s / steps));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function toScene(x: number, y: number, z: number): [number, number, number] {
  return [x * UNIT, (FLOOR_SKETCH_Y - y) * UNIT, z * UNIT];
}

/**
 * Builds a closed, indexed surface. `inflate` pushes the surface outward
 * (sketch units) — used for the mesh shell so it sits just above the skin.
 */
function loftGeometry({ stations, around, spacing }: LoftSpec, inflate = 0): BufferGeometry {
  const sections = sampleSections(stations, spacing);
  const positions: number[] = [];
  const indices: number[] = [];

  for (const s of sections) {
    for (let j = 0; j < around; j += 1) {
      const a = (j / around) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const rz = (sin >= 0 ? s.rzf : s.rzb) + inflate;
      positions.push(...toScene(s.x + (s.rx + inflate) * cos, s.y, s.z + rz * sin));
    }
  }
  for (let i = 0; i < sections.length - 1; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = (i + 1) * around + j;
      const d = (i + 1) * around + ((j + 1) % around);
      indices.push(a, b, c, b, d, c);
    }
  }
  // Caps: fan around the centre of the first and last cross-section.
  const capIndex = (ring: number, flip: boolean) => {
    const s = sections[ring];
    const centre = positions.length / 3;
    positions.push(...toScene(s.x, s.y, s.z));
    for (let j = 0; j < around; j += 1) {
      const a = ring * around + j;
      const b = ring * around + ((j + 1) % around);
      indices.push(...(flip ? [centre, b, a] : [centre, a, b]));
    }
  };
  capIndex(0, true);
  capIndex(sections.length - 1, false);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  ensureOutwardNormals(geometry, sections, around);
  return geometry;
}

/** Flips the triangle winding if the computed normals point into the body. */
function ensureOutwardNormals(geometry: BufferGeometry, sections: FullStation[], around: number) {
  const mid = Math.floor(sections.length / 2);
  const s = sections[mid];
  const vertex = mid * around; // angle 0 → points toward +x
  const normalX = geometry.getAttribute('normal').getX(vertex);
  const positionX = geometry.getAttribute('position').getX(vertex) - s.x * UNIT;
  if (normalX * positionX >= 0) return;
  const index = geometry.getIndex();
  if (!index) return;
  const array = index.array as Uint16Array | Uint32Array;
  for (let i = 0; i < array.length; i += 3) {
    const tmp = array[i + 1];
    array[i + 1] = array[i + 2];
    array[i + 2] = tmp;
  }
  index.needsUpdate = true;
  geometry.computeVertexNormals();
}

type Density = 'surface' | 'mesh';

/** Cross-section density per part: smooth for the skin, coarse for the visible scan mesh. */
function bodyParts(density: Density): LoftSpec[] {
  const d = density === 'surface';
  return [
    { stations: headStations(), around: d ? 32 : 16, spacing: d ? 1 : 5 },
    { stations: NECK, around: d ? 20 : 10, spacing: d ? 3 : 8 },
    { stations: TORSO, around: d ? 40 : 20, spacing: d ? 3.5 : 9 },
    { stations: ARM_AND_HAND, around: d ? 18 : 9, spacing: d ? 3.5 : 10 },
    { stations: mirrorX(ARM_AND_HAND), around: d ? 18 : 9, spacing: d ? 3.5 : 10 },
    { stations: LEG_AND_FOOT, around: d ? 22 : 11, spacing: d ? 3.5 : 10 },
    { stations: mirrorX(LEG_AND_FOOT), around: d ? 22 : 11, spacing: d ? 3.5 : 10 },
  ];
}

/** Smooth body surface (one merged geometry). */
export function createBodyGeometry(): BufferGeometry {
  const parts = bodyParts('surface').map((part) => loftGeometry(part));
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

/**
 * Triangulated scan-mesh lines sitting just above the surface. Each line
 * vertex keeps its surface normal so the shader can fade lines that face the
 * camera and keep the ones near the silhouette.
 */
export function createMeshLinesGeometry(): BufferGeometry {
  const parts = bodyParts('mesh').map((part) => loftGeometry(part, 0.6));
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());

  const position = merged.getAttribute('position');
  const normal = merged.getAttribute('normal');
  const index = merged.getIndex();
  const positions: number[] = [];
  const normals: number[] = [];
  const seen = new Set<string>();
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    for (const v of [a, b]) {
      positions.push(position.getX(v), position.getY(v), position.getZ(v));
      normals.push(normal.getX(v), normal.getY(v), normal.getZ(v));
    }
  };
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }
  }
  merged.dispose();

  const lines = new BufferGeometry();
  lines.setAttribute('position', new Float32BufferAttribute(positions, 3));
  lines.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  return lines;
}

/** Height of the figure in scene units (floor at 0). */
export const FIGURE_HEIGHT = (FLOOR_SKETCH_Y - 38) * UNIT;
