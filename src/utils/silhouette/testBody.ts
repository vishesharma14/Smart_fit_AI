import type { PoseLandmark } from '../../types/pose';
import type { ScanViewId } from '../../types/scan';
import { LM } from '../pose/landmarks';
import type { MaskView } from './extract';

/*
 * Test-only: renders the segmentation mask and image landmarks of a synthetic
 * person with known dimensions (cm), so outline measurements can be checked
 * against values worked out by hand. Never used by the app.
 *
 * Front (and back) widths: chest 32 · waist 27 · hips 35 · one thigh 17.
 * Side depths:              chest 24 · waist 20 · hips 26 · thigh 18.
 * Angled views (45° etc.): each torso cross-section is an ellipse of that width and depth, so it shows
 * √((W·cos θ)² + (D·sin θ)²); the legs are drawn side-on (they overlap).
 * Stature 175 · crotch 80 cm above the floor.
 * Mask edges are linear ramps, so the 0.5 crossing is exactly the shape's edge.
 */

export const BODY = {
  statureCm: 175,
  crotchCm: 80,
  front: { chest: 32, waist: 27, hip: 35, thigh: 17 },
  side: { chest: 24, waist: 20, hip: 26, thigh: 18 },
} as const;

export interface BodyOptions {
  /** Pixels per cm (camera distance). */
  pxPerCm?: number;
  /** Image size and floor row. */
  width?: number;
  height?: number;
  floorY?: number;
  /** Width (px) of the edge ramp: larger = blurrier mask. */
  softPx?: number;
  /** Multiplies torso widths (e.g. a noisy frame). */
  torsoScale?: number;
  /** Arms hanging against the torso instead of held away from it. */
  armsTouching?: boolean;
  /** Legs together: no gap between them. */
  legsTogether?: boolean;
  /** Angled views only: multiplies the rendered torso width (an outline that doesn't match the elliptical model). */
  angledScale?: number;
}

/** Body angle of each view (degrees, turning to the user's left). */
const VIEW_YAW: Record<ScanViewId, number> = {
  front: 0,
  'front-left': 45,
  left: 90,
  'back-left': 135,
  back: 180,
  'back-right': 225,
  right: 270,
  'front-right': 315,
};

interface Shape {
  /** Vertical extent (cm above the floor). */
  from: number;
  to: number;
  /** Ramp the bottom / top edge too (head top, feet, torso bottom at the crotch). */
  rampBottom?: boolean;
  rampTop?: boolean;
  /** Horizontal extent at a height, in cm from the body centre line. */
  span: (h: number) => [number, number];
}

const lerp = (h: number, h0: number, h1: number, v0: number, v1: number) => v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);

/** Piecewise-linear half-width through (height, value) points, ordered by height. */
const profile = (points: [number, number][]) => (h: number) => {
  if (h <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    if (h <= points[i][0]) return lerp(h, points[i - 1][0], points[i][0], points[i - 1][1], points[i][1]);
  }
  return points[points.length - 1][1];
};

const centred = (half: (h: number) => number) => (h: number): [number, number] => [-half(h), half(h)];

const FRONT_TORSO_HALF = profile([
  [80, 17.5],
  [96, 17.5],
  [100, 13.5],
  [112, 13.5],
  [118, 16],
  [146, 16],
]);
const SIDE_TORSO_HALF = profile([
  [78, 13],
  [98, 13],
  [100, 10],
  [114, 10],
  [116, 12],
  [146, 12],
]);
const SIDE_LEG_HALF = profile([
  [8, 4],
  [48, 5.5],
  [66, 9],
  [90, 9],
]);

function frontShapes(options: BodyOptions): Shape[] {
  const t = options.torsoScale ?? 1;
  const torsoHalf = FRONT_TORSO_HALF;
  const legCentre = options.legsTogether ? 8.5 : 9;
  const legHalf = profile([
    [8, 3.5],
    [48, 5],
    [70, 8.5],
    [90, 8.5],
  ]);
  const shapes: Shape[] = [
    { from: 157, to: 175, rampTop: true, span: centred(() => 8) },
    { from: 146, to: 157, span: centred(() => 6) },
    { from: 80, to: 146, rampBottom: true, span: centred((h) => torsoHalf(h) * t) },
  ];
  for (const side of [-1, 1]) {
    shapes.push(
      { from: 0, to: 90, rampBottom: true, span: (h) => [side * legCentre - legHalf(h), side * legCentre + legHalf(h)] },
      // Arms: shoulder (19, 144) → elbow → wrist → hand tip, held 30° away from the body (or hanging against it).
      ...armShapes(side, options.armsTouching ?? false),
    );
  }
  return shapes;
}

function armShapes(side: number, touching: boolean): Shape[] {
  const tan = touching ? 0 : Math.tan(Math.PI / 6);
  const start = touching ? 20 : 19;
  const pts = [
    { h: 144, x: start },
    { h: 116, x: start + 28 * tan },
    { h: 92, x: start + 52 * tan },
  ];
  const tip = { h: 92 - 0.6 * 24, x: pts[2].x + 0.6 * (pts[2].x - pts[1].x) };
  const all = [...pts, tip];
  const halves = [4.5, 3.5, 4];
  return all.slice(1).map((end, i) => {
    const begin = all[i];
    return {
      from: end.h,
      to: begin.h,
      span: (h: number): [number, number] => {
        const x = lerp(h, begin.h, end.h, begin.x, end.x);
        return [side * x - halves[i], side * x + halves[i]].sort((a, b) => a - b) as [number, number];
      },
    };
  });
}

function sideShapes(options: BodyOptions): Shape[] {
  const t = options.torsoScale ?? 1;
  const torsoHalf = SIDE_TORSO_HALF;
  const legHalf = SIDE_LEG_HALF;
  return [
    { from: 157, to: 175, rampTop: true, span: centred(() => 9) },
    { from: 146, to: 157, span: centred(() => 6) },
    { from: 80, to: 146, rampBottom: true, span: centred((h) => torsoHalf(h) * t) },
    { from: 8, to: 90, span: centred(legHalf) },
    // Foot: heel to toe.
    { from: 0, to: 8, rampBottom: true, span: () => [-4, 18] },
  ];
}

function angledShapes(yawDeg: number, options: BodyOptions): Shape[] {
  const t = (options.torsoScale ?? 1) * (options.angledScale ?? 1);
  const c = Math.abs(Math.cos((yawDeg * Math.PI) / 180));
  const sn = Math.abs(Math.sin((yawDeg * Math.PI) / 180));
  const half = (h: number) => Math.hypot(FRONT_TORSO_HALF(h) * c, SIDE_TORSO_HALF(h) * sn) * t;
  return [
    { from: 157, to: 175, rampTop: true, span: centred(() => 8.5) },
    { from: 146, to: 157, span: centred(() => 6) },
    { from: 80, to: 146, rampBottom: true, span: centred(half) },
    { from: 8, to: 90, span: centred(SIDE_LEG_HALF) },
    { from: 0, to: 8, rampBottom: true, span: () => [-8, 8] },
  ];
}

const isSide = (phase: ScanViewId) => phase === 'left' || phase === 'right';
const isAngled = (phase: ScanViewId) => VIEW_YAW[phase] % 90 !== 0;

export function renderBodyMask(phase: ScanViewId, options: BodyOptions = {}): MaskView {
  const W = options.width ?? 480;
  const H = options.height ?? 720;
  const s = options.pxPerCm ?? 600 / BODY.statureCm;
  const floorY = options.floorY ?? 660;
  const soft = options.softPx ?? 1.5;
  const cx = W / 2;
  const shapes = isAngled(phase) ? angledShapes(VIEW_YAW[phase], options) : isSide(phase) ? sideShapes(options) : frontShapes(options);
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const h = (floorY - y) / s;
    for (const shape of shapes) {
      // Vertical ramps on the outer edges; hard cut elsewhere (a slightly extended range keeps the ramp continuous).
      const pad = soft / s;
      if (h < shape.from - (shape.rampBottom ? pad : 0) || h > shape.to + (shape.rampTop ? pad : 0)) continue;
      const vertical = Math.min(
        shape.rampBottom ? 0.5 + ((h - shape.from) * s) / soft : 1,
        shape.rampTop ? 0.5 + ((shape.to - h) * s) / soft : 1,
      );
      const [a, b] = shape.span(Math.min(shape.to, Math.max(shape.from, h)));
      const left = cx + a * s;
      const right = cx + b * s;
      const x0 = Math.max(0, Math.floor(left - soft));
      const x1 = Math.min(W - 1, Math.ceil(right + soft));
      for (let x = x0; x <= x1; x += 1) {
        const horizontal = 0.5 + Math.min(x - left, right - x) / soft;
        const v = Math.min(1, Math.max(0, Math.min(horizontal, vertical)));
        if (v > data[y * W + x]) data[y * W + x] = v;
      }
    }
  }
  return { width: W, height: H, data };
}

/** Image landmarks (0–1) matching the rendered body, plus visibility. */
export function bodyLandmarks(phase: ScanViewId, options: BodyOptions = {}): PoseLandmark[] {
  const W = options.width ?? 480;
  const H = options.height ?? 720;
  const s = options.pxPerCm ?? 600 / BODY.statureCm;
  const floorY = options.floorY ?? 660;
  const cx = W / 2;
  const side = isSide(phase);
  // Angled views: the front layout foreshortened by |cos θ| (arms stay held away, clear of the torso).
  const squeeze = isAngled(phase) ? Math.abs(Math.cos((VIEW_YAW[phase] * Math.PI) / 180)) : 1;
  const tan = options.armsTouching ? 0 : Math.tan(Math.PI / 6);
  const start = options.armsTouching ? 20 : 19;
  const legX = options.legsTogether ? 8.5 : 9;
  // [x (cm from the centre line; person's left positive), height cm]
  const joints: Partial<Record<number, [number, number]>> = side
    ? {
        [LM.nose]: [10, 164],
        [LM.leftEar]: [0.5, 158],
        [LM.rightEar]: [-0.5, 158],
        [LM.leftShoulder]: [0.5, 144],
        [LM.rightShoulder]: [-0.5, 144],
        [LM.leftElbow]: [0.5, 116],
        [LM.rightElbow]: [-0.5, 116],
        [LM.leftWrist]: [0.5, 92],
        [LM.rightWrist]: [-0.5, 92],
        [LM.leftHip]: [0.5, 90],
        [LM.rightHip]: [-0.5, 90],
        [LM.leftKnee]: [0.5, 48],
        [LM.rightKnee]: [-0.5, 48],
        [LM.leftAnkle]: [0.5, 8],
        [LM.rightAnkle]: [-0.5, 8],
        [LM.leftHeel]: [-2, 3],
        [LM.rightHeel]: [-2, 3],
        [LM.leftFoot]: [16, 2],
        [LM.rightFoot]: [16, 2],
      }
    : {
        [LM.nose]: [0, 164],
        [LM.leftEar]: [7, 158],
        [LM.rightEar]: [-7, 158],
        [LM.leftShoulder]: [start, 144],
        [LM.rightShoulder]: [-start, 144],
        [LM.leftElbow]: [start + 28 * tan, 116],
        [LM.rightElbow]: [-(start + 28 * tan), 116],
        [LM.leftWrist]: [start + 52 * tan, 92],
        [LM.rightWrist]: [-(start + 52 * tan), 92],
        [LM.leftHip]: [legX, 90],
        [LM.rightHip]: [-legX, 90],
        [LM.leftKnee]: [legX, 48],
        [LM.rightKnee]: [-legX, 48],
        [LM.leftAnkle]: [legX, 8],
        [LM.rightAnkle]: [-legX, 8],
        [LM.leftHeel]: [legX, 3],
        [LM.rightHeel]: [-legX, 3],
        [LM.leftFoot]: [legX, 2],
        [LM.rightFoot]: [-legX, 2],
      };
  return Array.from({ length: 33 }, (_, i) => {
    const [x, h] = joints[i] ?? [0, 160];
    return { x: (cx + x * squeeze * s) / W, y: (floorY - h * s) / H, z: 0, visibility: 0.95 };
  });
}
