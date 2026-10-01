/**
 * Procedural wireframe mannequin used as a scan positioning guide.
 *
 * The body is built from "lofts": stacks of horizontal elliptical cross-
 * sections (rings) joined by vertical lines (meridians). Proportions follow a
 * generic adult figure roughly 7.5 heads tall. It is a fixed reference shape —
 * it is never fitted to, or derived from, the user's camera image.
 *
 * Model space: x to the figure's left (viewer's right when facing the camera),
 * y downward (matching SVG), z toward the camera. Height spans y ≈ 38–382.
 */

export interface MeshPoint {
  x: number;
  y: number;
  z: number;
  /** Horizontal surface normal, used to tell front-facing lines from hidden ones. */
  nx: number;
  nz: number;
}

export type MeshLine = MeshPoint[];

interface Station {
  y: number;
  /** Cross-section centre. */
  x?: number;
  z?: number;
  /** Half-width (left–right). */
  rx: number;
  /** Half-depth toward the front (chest, toes) and toward the back (shoulder blades, heels). */
  rzf: number;
  rzb: number;
}

interface LoftOptions {
  /** Number of points around each ring (and number of meridians). */
  around: number;
  /** Target vertical distance between rings. */
  ringSpacing: number;
  /** Draw every Nth meridian (rings use every point). */
  meridianStep?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Cosine easing between stations gives rounder transitions than straight interpolation. */
const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

function interpolateStations(stations: Station[], spacing: number): Required<Station>[] {
  const result: Required<Station>[] = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    const steps = Math.max(1, Math.round(Math.abs(b.y - a.y) / spacing));
    for (let s = 0; s < steps; s += 1) {
      const t = ease(s / steps);
      result.push({
        y: lerp(a.y, b.y, s / steps),
        x: lerp(a.x ?? 0, b.x ?? 0, t),
        z: lerp(a.z ?? 0, b.z ?? 0, t),
        rx: lerp(a.rx, b.rx, t),
        rzf: lerp(a.rzf, b.rzf, t),
        rzb: lerp(a.rzb, b.rzb, t),
      });
    }
  }
  const last = stations[stations.length - 1];
  result.push({ x: 0, z: 0, ...last });
  return result;
}

function ringPoint(s: Required<Station>, angle: number): MeshPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rz = sin >= 0 ? s.rzf : s.rzb;
  // Normal of an ellipse (rx·cos, rz·sin) is proportional to (cos/rx, sin/rz).
  const nx = cos / Math.max(s.rx, 0.01);
  const nz = sin / Math.max(rz, 0.01);
  const length = Math.hypot(nx, nz) || 1;
  return { x: s.x + s.rx * cos, y: s.y, z: s.z + rz * sin, nx: nx / length, nz: nz / length };
}

function loft(stations: Station[], { around, ringSpacing, meridianStep = 1 }: LoftOptions): MeshLine[] {
  const sections = interpolateStations(stations, ringSpacing);
  const angles = Array.from({ length: around }, (_, i) => (i / around) * Math.PI * 2 + Math.PI / 2);
  const lines: MeshLine[] = [];

  // Rings (closed loops).
  for (const section of sections) {
    const ring = angles.map((angle) => ringPoint(section, angle));
    ring.push(ring[0]);
    lines.push(ring);
  }
  // Meridians (head-to-toe lines along the surface).
  for (let i = 0; i < around; i += meridianStep) {
    lines.push(sections.map((section) => ringPoint(section, angles[i])));
  }
  return lines;
}

/** Ellipsoid head with a slightly narrower jaw. */
function head(): MeshLine[] {
  const cy = 62;
  const ry = 24;
  const stations: Station[] = [];
  const rings = 9;
  for (let i = 0; i <= rings; i += 1) {
    const phi = (i / rings) * Math.PI;
    const y = cy - ry * Math.cos(phi);
    const r = Math.max(Math.sin(phi), 0.06);
    const jaw = y > cy ? 1 - 0.22 * ((y - cy) / ry) : 1;
    stations.push({ y, z: 2.5, rx: 15.5 * r * jaw, rzf: 18.5 * r * jaw, rzb: 17 * r });
  }
  return loft(stations, { around: 14, ringSpacing: 100 });
}

const mirrorX = (stations: Station[]): Station[] => stations.map((s) => ({ ...s, x: -(s.x ?? 0) }));

const NECK: Station[] = [
  { y: 82, z: 1.5, rx: 7.5, rzf: 7, rzb: 8 },
  { y: 100, z: -0.5, rx: 8.5, rzf: 8, rzb: 8.5 },
];

const TORSO: Station[] = [
  { y: 98, z: -1, rx: 9, rzf: 8.5, rzb: 8.5 },
  { y: 103, z: -1.5, rx: 23, rzf: 10.5, rzb: 11 },
  { y: 108, z: -1.5, rx: 36, rzf: 13.5, rzb: 14 },
  { y: 116, z: -1, rx: 38.5, rzf: 17, rzb: 16 },
  { y: 128, rx: 34.5, rzf: 22, rzb: 16.5 },
  { y: 140, rx: 33, rzf: 22.5, rzb: 15.5 },
  { y: 152, rx: 30.5, rzf: 18.5, rzb: 14.5 },
  { y: 166, z: 0.5, rx: 27, rzf: 15.5, rzb: 13.5 },
  { y: 180, z: 0.5, rx: 28, rzf: 16, rzb: 15 },
  { y: 194, rx: 31.5, rzf: 16, rzb: 19 },
  { y: 207, z: -1, rx: 34, rzf: 15.5, rzb: 22 },
  { y: 216, z: -1, rx: 31, rzf: 13.5, rzb: 18.5 },
];

/** Figure's left arm (positive x), relaxed slightly away from the body. */
const ARM: Station[] = [
  { y: 101, x: 36, rx: 3, rzf: 3.5, rzb: 3.5 },
  { y: 106, x: 38.5, rx: 8, rzf: 8.5, rzb: 8.5 },
  { y: 120, x: 41.5, rx: 9, rzf: 8.8, rzb: 8.8 },
  { y: 146, x: 45, rx: 7.6, rzf: 7.6, rzb: 7.6 },
  { y: 172, x: 48.5, rx: 6.1, rzf: 6.1, rzb: 6.3 },
  { y: 192, x: 51.5, rx: 6.4, rzf: 6.8, rzb: 6.5 },
  { y: 218, x: 54.5, rx: 4.9, rzf: 5.1, rzb: 5.1 },
  { y: 234, x: 56, rx: 3.9, rzf: 4.3, rzb: 4.3 },
];

/** Hand, palm facing the thigh: thin left–right, wider front–back. */
const HAND: Station[] = [
  { y: 234, x: 56, rx: 3.2, rzf: 4.6, rzb: 4.4 },
  { y: 244, x: 57, rx: 3.4, rzf: 6.2, rzb: 5.4 },
  { y: 256, x: 57.5, rx: 3, rzf: 5.6, rzb: 4.6 },
  { y: 265, x: 57.5, rx: 2.2, rzf: 3.6, rzb: 2.8 },
  { y: 270, x: 57.5, rx: 0.8, rzf: 1.2, rzb: 1 },
];

/** Figure's left leg (positive x). */
const LEG: Station[] = [
  { y: 206, x: 15, rx: 16, rzf: 14.5, rzb: 18 },
  { y: 216, x: 15.5, rx: 15.5, rzf: 14.5, rzb: 16.5 },
  { y: 234, x: 16.5, rx: 14, rzf: 13.5, rzb: 14.5 },
  { y: 260, x: 17, rx: 11.8, rzf: 11.5, rzb: 11.5 },
  { y: 286, x: 17.5, rx: 9.2, rzf: 9.5, rzb: 9 },
  { y: 300, x: 18, rx: 8.4, rzf: 9, rzb: 8.4 },
  { y: 318, x: 18, rx: 9, rzf: 8.2, rzb: 11 },
  { y: 342, x: 18, rx: 6.8, rzf: 6.5, rzb: 7.5 },
  { y: 364, x: 18, rx: 4.8, rzf: 5, rzb: 5.2 },
];

/** Foot pointing toward the camera, heel slightly behind the ankle. */
const FOOT: Station[] = [
  { y: 364, x: 18, rx: 4.8, rzf: 5, rzb: 5.2 },
  { y: 372, x: 18.5, z: 3, rx: 5.6, rzf: 10, rzb: 6 },
  { y: 379, x: 19, z: 5, rx: 6, rzf: 14, rzb: 6.2 },
  { y: 382, x: 19, z: 5, rx: 4.5, rzf: 12, rzb: 5 },
];

function buildMannequin(): MeshLine[] {
  const limb = { around: 10, ringSpacing: 9 };
  return [
    ...head(),
    ...loft(NECK, { around: 10, ringSpacing: 6 }),
    ...loft(TORSO, { around: 22, ringSpacing: 8 }),
    ...loft(ARM, limb),
    ...loft(mirrorX(ARM), limb),
    ...loft(HAND, { around: 8, ringSpacing: 6 }),
    ...loft(mirrorX(HAND), { around: 8, ringSpacing: 6 }),
    ...loft(LEG, { around: 12, ringSpacing: 9 }),
    ...loft(mirrorX(LEG), { around: 12, ringSpacing: 9 }),
    ...loft(FOOT, { around: 10, ringSpacing: 5 }),
    ...loft(mirrorX(FOOT), { around: 10, ringSpacing: 5 }),
  ];
}

/** Built once at module load; the shape never changes. */
export const MANNEQUIN_MESH: MeshLine[] = buildMannequin();

/** Floor ring the figure stands on (model space). */
export const FLOOR_Y = 383;
export const FLOOR_RADIUS = 46;
