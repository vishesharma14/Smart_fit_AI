import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '../../../utils/motion';
import { MannequinScene, isWebGLAvailable } from './MannequinScene';
import './MannequinCanvas.css';

const FULL_RANGE: [number, number] = [0, 1];

interface MannequinCanvasProps {
  /** Target rotation in radians (0 = facing the camera). */
  yaw: number;
  /** Vertical part of the figure to show (0 = feet, 1 = head top). */
  range?: [number, number];
}

/**
 * React wrapper around the Three.js mannequin scene. Loaded lazily so the 3D
 * code is only downloaded once the camera preview is shown. Draws only on
 * resize and while turning to a new angle.
 */
export default function MannequinCanvas({ yaw, range = FULL_RANGE }: MannequinCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MannequinScene | null>(null);
  const currentYawRef = useRef(yaw);
  const rangeRef = useRef(range);
  const [rangeBottom, rangeTop] = range;
  const reduceMotion = useReducedMotion();
  const [supported] = useState(isWebGLAvailable);
  const [ready, setReady] = useState(false);

  // Create the scene once, keep it sized to its container, and release the GPU context on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !supported) return;
    let scene: MannequinScene;
    try {
      scene = new MannequinScene();
    } catch {
      return;
    }
    container.appendChild(scene.canvas);
    sceneRef.current = scene;
    scene.setYaw(currentYawRef.current);
    scene.setRange(...rangeRef.current);

    const resize = () => scene.setSize(container.clientWidth, container.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const frame = requestAnimationFrame(() => setReady(true));

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [supported]);

  // Frame the requested part of the figure.
  useEffect(() => {
    rangeRef.current = [rangeBottom, rangeTop];
    sceneRef.current?.setRange(rangeBottom, rangeTop);
  }, [rangeBottom, rangeTop]);

  // Turn to the new angle only when it changes — no idle animation.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      currentYawRef.current = yaw;
      return;
    }
    if (reduceMotion) {
      currentYawRef.current = yaw;
      scene.setYaw(yaw);
      return;
    }
    const controls = animate(currentYawRef.current, yaw, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (value) => {
        currentYawRef.current = value;
        scene.setYaw(value);
      },
    });
    return () => controls.stop();
  }, [yaw, reduceMotion]);

  if (!supported) return null;
  return <div ref={containerRef} className={['mannequin-canvas', ready ? 'mannequin-canvas--ready' : ''].join(' ')} />;
}
