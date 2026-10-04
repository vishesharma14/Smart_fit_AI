import { useEffect, useRef } from 'react';
import type { PoseLandmark } from '../../types/pose';
import type { SilhouetteFrame } from '../../types/silhouette';
import { POSE_BONES } from '../../utils/pose/landmarks';
import { findFrontLevels, LEVEL_IDS } from '../../utils/silhouette/levels';
import './PoseDebugOverlay.css';

interface PoseDebugOverlayProps {
  /** Detected image landmarks (0–1 of the unmirrored video frame), or null. */
  landmarks: PoseLandmark[] | null;
  videoWidth: number;
  videoHeight: number;
  mirrored: boolean;
  valid: boolean;
  /** Latest frame's body outline (mask pixels), drawn as edges plus the measurement levels. */
  silhouette?: SilhouetteFrame | null;
}

/**
 * Developer view (enabled with `?poseDebug`): draws the landmarks the pose
 * model actually returned over the preview, mapped through the same
 * `object-fit: cover` crop and mirroring as the video, plus the body outline's
 * edges, head top / floor / crotch, and the front-view measurement levels.
 */
export function PoseDebugOverlay({ landmarks, videoWidth, videoHeight, mirrored, valid, silhouette = null }: PoseDebugOverlayProps) {
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

    if (!silhouette) return;
    // Outline: mask pixels → the same 0–1 frame coordinates as the landmarks.
    const at = (x: number, y: number) => project({ x: x / silhouette.width, y: y / silhouette.height, z: 0, visibility: 1 });
    const dot = (x: number, y: number) => {
      const p = at(x, y);
      context.fillRect(p.x - 1, p.y - 1, 2, 2);
    };
    silhouette.rows.forEach((row, y) => {
      if (!row || y % 3) return;
      context.fillStyle = 'rgb(232 121 249 / 0.9)';
      if (row.center) {
        dot(row.center.left, y);
        dot(row.center.right, y);
      }
      context.fillStyle = 'rgb(251 146 60 / 0.9)';
      for (const leg of [row.leftLeg, row.rightLeg]) {
        if (leg && leg !== row.center) {
          dot(leg.left, y);
          dot(leg.right, y);
        }
      }
    });
    const hLine = (y: number, label: string, rgb: string) => {
      const from = at(0, y);
      const to = at(silhouette.width, y);
      context.strokeStyle = `rgb(${rgb} / 0.8)`;
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = `rgb(${rgb})`;
      context.font = '11px ui-monospace, monospace';
      context.fillText(label, Math.min(from.x, to.x) + 6, from.y - 3);
    };
    if (silhouette.headTopY !== null) hLine(silhouette.headTopY, `head top${silhouette.headClipped ? ' (cut off)' : ''}`, '103 232 249');
    if (silhouette.floorY !== null) hLine(silhouette.floorY, `floor${silhouette.floorClipped ? ' (cut off)' : ''}`, '103 232 249');
    if (silhouette.crotchY !== null) hLine(silhouette.crotchY, 'crotch', '251 146 60');
    const front = findFrontLevels(silhouette, landmarks);
    for (const id of LEVEL_IDS) {
      const level = front.levels[id];
      if (level) hLine(level.y, `${id} ${Math.round(level.sizePx)}px`, '250 204 21');
    }
  }, [landmarks, videoWidth, videoHeight, mirrored, valid, silhouette]);

  return <canvas ref={canvasRef} className="pose-debug-overlay" aria-hidden="true" />;
}
