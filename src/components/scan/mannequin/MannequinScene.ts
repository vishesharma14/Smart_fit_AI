import {
  CircleGeometry,
  Color,
  Group,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { FIGURE_HEIGHT, createBodyGeometry, createMeshLinesGeometry } from './mannequinGeometry';

/*
 * Studio look, done in one small shader rather than scene lights:
 * a soft key light from upper-left-front, a cool fill from the right, a
 * restrained specular highlight, and a fresnel rim that shifts from purple
 * (left) to cyan (right). The body writes partial alpha so the live camera
 * stays visible through it — a dark, glass-like figure. Because the body is
 * drawn opaque (depth-tested, unblended), overlapping parts never show
 * through each other.
 */
const BODY_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRimCool;
  uniform vec3 uRimWarm;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vViewPosition);
    float ndv = clamp(dot(n, v), 0.0, 1.0);

    vec3 keyDir = normalize(vec3(-0.55, 0.7, 0.65));
    vec3 fillDir = normalize(vec3(0.75, -0.05, 0.45));
    // Wrapped diffuse keeps the shadow side soft, like a large studio softbox.
    float key = clamp((dot(n, keyDir) + 0.35) / 1.35, 0.0, 1.0);
    float fill = clamp((dot(n, fillDir) + 0.2) / 1.2, 0.0, 1.0);
    float light = 0.16 + key * 0.62 + fill * 0.16;

    vec3 halfDir = normalize(keyDir + v);
    float spec = pow(max(dot(n, halfDir), 0.0), 42.0) * 0.32;

    float fresnel = pow(1.0 - ndv, 2.6);
    vec3 rim = mix(uRimWarm, uRimCool, smoothstep(-0.5, 0.6, n.x)) * fresnel * 0.85;

    vec3 color = uBase * light + rim + vec3(0.82, 0.92, 1.0) * spec;
    float alpha = clamp(0.62 + fresnel * 0.33 + spec * 0.4, 0.0, 0.95);
    // Canvas uses premultiplied alpha.
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

/** Mesh lines: brighter toward the silhouette, faint where they face the camera. */
const LINE_VERTEX = /* glsl */ `
  varying float vFacing;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = clamp(dot(n, normalize(-viewPosition.xyz)), 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vFacing;
  void main() {
    // Mesh reads at the silhouette and fades almost away where the surface faces the camera.
    float alpha = mix(0.46, 0.11, smoothstep(0.1, 0.9, vFacing));
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

/** Soft scan disc under the feet. */
const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float r = distance(vUv, vec2(0.5)) * 2.0;
    float disc = (1.0 - smoothstep(0.0, 1.0, r)) * 0.22;
    float ring = smoothstep(0.86, 0.9, r) * (1.0 - smoothstep(0.9, 0.94, r)) * 0.55;
    float alpha = disc + ring;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Lens and framing: a slightly long lens (less distortion) looking a little down at the figure. */
const FOV = 24;
/**
 * Fraction of the view height the figure occupies, leaving room for the frame
 * and labels. Close to the size a person can fill while staying fully in view,
 * so the guide doesn't suggest standing farther away than needed.
 */
const FILL = 0.82;
const CAMERA_LIFT = 0.55;

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Imperative Three.js scene for the reference mannequin. Renders only when
 * asked (on resize and while the angle animates) — no continuous loop.
 */
export class MannequinScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 0.75, 0.1, 100);
  private readonly figure = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  /** The scene owns its canvas so every instance gets a fresh WebGL context. */
  readonly canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    const bodyGeometry = createBodyGeometry();
    const bodyMaterial = new ShaderMaterial({
      vertexShader: BODY_VERTEX,
      fragmentShader: BODY_FRAGMENT,
      uniforms: {
        uBase: { value: new Color('#5b6f99') },
        uRimCool: { value: new Color('#22d3ee') },
        uRimWarm: { value: new Color('#8b5cf6') },
      },
      // Let the mesh lines win the depth test where they sit on the surface.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.figure.add(new Mesh(bodyGeometry, bodyMaterial));

    const linesGeometry = createMeshLinesGeometry();
    const linesMaterial = new ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: { uColor: { value: new Color('#9eeefc') } },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    });
    this.figure.add(new LineSegments(linesGeometry, linesMaterial));

    const floorGeometry = new CircleGeometry(0.62, 64);
    const floorMaterial = new ShaderMaterial({
      vertexShader: FLOOR_VERTEX,
      fragmentShader: FLOOR_FRAGMENT,
      uniforms: { uColor: { value: new Color('#22d3ee') } },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    });
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.005;
    floor.renderOrder = -1;

    this.scene.add(floor, this.figure);
    this.geometries.push(bodyGeometry, linesGeometry, floorGeometry);
    this.materials.push(bodyMaterial, linesMaterial, floorMaterial);
  }

  /** Resizes the drawing buffer and reframes the figure for the new aspect ratio. */
  setSize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    const centreY = FIGURE_HEIGHT / 2;
    const halfFov = ((FOV / 2) * Math.PI) / 180;
    // Distance at which the figure fills FILL of the height (or of the width on very wide frames).
    const byHeight = FIGURE_HEIGHT / 2 / FILL / Math.tan(halfFov);
    const figureWidth = 1.3;
    const byWidth = figureWidth / 2 / FILL / (Math.tan(halfFov) * this.camera.aspect);
    const distance = Math.max(byHeight, byWidth);

    this.camera.position.set(0, centreY + CAMERA_LIFT, distance);
    this.camera.lookAt(0, centreY - 0.06, 0);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  /** Turns the figure (radians; 0 = facing the camera) and redraws. */
  setYaw(yaw: number): void {
    this.figure.rotation.y = yaw;
    this.render();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.renderer.dispose();
    // Free the GPU context right away rather than waiting for garbage collection.
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
