import { FLOOR_RADIUS, FLOOR_Y, type MeshLine } from './mannequinGeometry';

/** Camera looks slightly down at the figure, which turns flat rings into visible ellipses. */
const PITCH = (15 * Math.PI) / 180;
const PIVOT_Y = 210;
/** Distance of the virtual camera; smaller = stronger perspective. */
const CAMERA_DISTANCE = 700;
/** Fit the figure inside the 300×400 guide frame. */
const SCALE = 0.92;
const SCREEN_CX = 150;
const SCREEN_CY = 206;

/** Depth bands for front-facing lines: nearer lines are drawn brighter. */
export const DEPTH_BANDS = 4;

export interface ProjectedMannequin {
  /** Path data for lines on the far side of the body (drawn faint). */
  hidden: string;
  /** Path data for front-facing lines, from farthest (index 0) to nearest. */
  visible: string[];
  floor: string;
}

interface Projected {
  x: number;
  y: number;
  depth: number;
  facing: boolean;
}

function project(x: number, y: number, z: number, cosYaw: number, sinYaw: number) {
  // Turn around the vertical axis…
  const rx = x * cosYaw + z * sinYaw;
  const rz = -x * sinYaw + z * cosYaw;
  // …tilt for the slightly-from-above camera…
  const dy = y - PIVOT_Y;
  const py = dy * Math.cos(PITCH) + rz * Math.sin(PITCH);
  const pz = rz * Math.cos(PITCH) - dy * Math.sin(PITCH);
  // …then apply perspective.
  const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - pz);
  return {
    x: SCREEN_CX + rx * perspective * SCALE,
    y: SCREEN_CY + py * perspective * SCALE,
    depth: rz,
  };
}

const fmt = (n: number) => n.toFixed(1);

/**
 * Projects the mesh for a given yaw (radians; 0 = facing the camera) into SVG
 * path strings. Line segments whose surface faces away from the camera go to
 * `hidden`; the rest are bucketed by depth.
 */
export function projectMannequin(mesh: MeshLine[], yaw: number): ProjectedMannequin {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const hidden: string[] = [];
  const visible: string[][] = Array.from({ length: DEPTH_BANDS }, () => []);

  for (const line of mesh) {
    const points: Projected[] = line.map((p) => {
      const projected = project(p.x, p.y, p.z, cosYaw, sinYaw);
      // Camera sits on +z: a surface faces it when its rotated normal points toward +z.
      const normalZ = -p.nx * sinYaw + p.nz * cosYaw;
      return { ...projected, facing: normalZ > -0.05 };
    });

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segment = `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`;
      if (!(a.facing && b.facing)) {
        hidden.push(segment);
        continue;
      }
      // Depth roughly spans -45 (far arm in side view) to +45 (near arm).
      const depth = (a.depth + b.depth) / 2;
      const band = Math.min(DEPTH_BANDS - 1, Math.max(0, Math.floor(((depth + 45) / 90) * DEPTH_BANDS)));
      visible[band].push(segment);
    }
  }

  const floor = Array.from({ length: 49 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2;
    const p = project(Math.cos(angle) * FLOOR_RADIUS, FLOOR_Y, Math.sin(angle) * FLOOR_RADIUS, 1, 0);
    return `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`;
  }).join('');

  return { hidden: hidden.join(''), visible: visible.map((band) => band.join('')), floor };
}
