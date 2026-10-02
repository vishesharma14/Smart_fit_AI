import { useEffect, useRef } from 'react';
import type { PoseLandmark } from '../../types/pose';
import { POSE_BONES } from '../../utils/pose/landmarks';
import './PoseDebugOverlay.css';

interface PoseDebugOverlayProps {
  /** Detected image landmarks (0–1 of the unmirrored video frame), or null. */
  landmarks: PoseLandmark[] | null;
  videoWidth: number;
  videoHeight: number;
  mirrored: boolean;
  valid: boolean;
}

/**
 * Developer view (enabled with `?poseDebug`): draws the landmarks the pose
 * model actually returned over the preview, mapped through the same
 * `object-fit: cover` crop and mirroring as the video.
 */
export function PoseDebugOverlay({ landmarks, videoWidth, videoHeight, mirrored, valid }: PoseDebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!landmarks || !videoWidth || !videoHeight) return;

    const scale = Math.max(width / videoWidth, height / videoHeight);
    const offsetX = (width - videoWidth * scale) / 2;
    const offsetY = (height - videoHeight * scale) / 2;
    const project = (point: PoseLandmark) => {
      const x = offsetX + point.x * videoWidth * scale;
      return { x: mirrored ? width - x : x, y: offsetY + point.y * videoHeight * scale };
    };

    const color = valid ? '52 211 153' : '34 211 238';
    context.lineWidth = 2;
    for (const [a, b] of POSE_BONES) {
      const alpha = Math.min(landmarks[a].visibility, landmarks[b].visibility) < 0.5 ? 0.25 : 0.85;
      const from = project(landmarks[a]);
      const to = project(landmarks[b]);
      context.strokeStyle = `rgb(${color} / ${alpha})`;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    for (const point of landmarks) {
      const { x, y } = project(point);
      context.fillStyle = `rgb(${color} / ${point.visibility < 0.5 ? 0.3 : 1})`;
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }, [landmarks, videoWidth, videoHeight, mirrored, valid]);

  return <canvas ref={canvasRef} className="pose-debug-overlay" aria-hidden="true" />;
}
