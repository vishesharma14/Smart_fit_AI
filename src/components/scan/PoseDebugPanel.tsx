import type { UseCamera } from '../../hooks/useCamera';
import type { PoseScanState } from '../../hooks/usePoseScan';
import { POSE_MODEL_NAME } from '../../services/pose/poseLandmarker';
import type { ScanCapture, ScanPhaseId } from '../../types/scan';
import type { ScanRegionDefinition } from '../../utils/pose/scanRegions';
import './PoseDebugPanel.css';

const fixed = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value) ? '–' : value.toFixed(digits);

/** Developer readout (enabled with `?poseDebug`) of the live detection values behind the guidance. */
interface PoseDebugPanelProps {
  pose: PoseScanState;
  camera: UseCamera;
  scanRegion: ScanRegionDefinition;
  captures: Partial<Record<ScanPhaseId, ScanCapture>>;
}

export function PoseDebugPanel({ pose, camera, scanRegion, captures }: PoseDebugPanelProps) {
  const { assessment, stats, silhouette } = pose;
  const orientation = assessment?.orientation;
  const metrics = assessment?.metrics;
  const { videoSize, zoom } = camera;
  const rows: [string, string][] = [
    ['Region', scanRegion.id],
    [
      'Camera',
      `${videoSize ? `${videoSize.width}×${videoSize.height}` : '–'} · zoom ${
        !zoom ? '–' : zoom.supported ? `${zoom.value ?? '?'} (range ${zoom.min}–${zoom.max})` : 'not exposed'
      }`,
    ],
    ['Model', `${POSE_MODEL_NAME} · ${pose.delegate ?? '–'} · ${pose.status}`],
    ['Inference', stats ? `${fixed(stats.inferenceMs, 1)} ms · ${stats.detectionsPerSecond}/s` : '–'],
    ['People', String(assessment?.people ?? '–')],
    ['Issue', assessment ? (assessment.issue ? JSON.stringify(assessment.issue) : 'none') : '–'],
    ['View', orientation ? `${orientation.view} → ${orientation.orientation ?? 'uncertain'} (${fixed(orientation.confidence)})` : '–'],
    ['Width ratio', orientation ? `${fixed(orientation.widthRatio)} (rel ${fixed(orientation.relativeWidth)})` : '–'],
    ['Front / facing', orientation ? `${fixed(orientation.frontness)} / ${fixed(orientation.facing)}` : '–'],
    ['World yaw', orientation ? `${fixed(orientation.worldYawDeg, 0)}°` : '–'],
    [
      'Cues in view',
      orientation
        ? Object.entries(orientation.cues)
            .filter(([, inView]) => inView)
            .map(([name]) => name)
            .join(', ') || 'none'
        : '–',
    ],
    [
      'Signals',
      orientation
        ? Object.entries(orientation.signals)
            .map(([name, value]) => `${name} ${fixed(value, 1)}`)
            .join(' · ')
        : '–',
    ],
    ['Region span', fixed(metrics?.span)],
    ['Tilt', metrics ? `${fixed(metrics.tiltDeg, 1)}°` : '–'],
    ['Arms', metrics ? `${fixed(metrics.armAnglesDeg[0], 0)}° / ${fixed(metrics.armAnglesDeg[1], 0)}°` : '–'],
    ['Stance', fixed(metrics?.stanceRatio)],
    ['Jitter', `${fixed(pose.jitter, 3)}${pose.moving ? ' (moving)' : ''}`],
    ['Hold', fixed(pose.holdProgress)],
    [
      'Outline',
      silhouette
        ? `${silhouette.width}×${silhouette.height} · stature ${
            silhouette.headTopY !== null && silhouette.floorY !== null ? fixed(silhouette.floorY - silhouette.headTopY, 0) : '–'
          } px${silhouette.headClipped ? ' · head cut off' : ''}${silhouette.floorClipped ? ' · feet cut off' : ''} · crotch ${
            silhouette.crotchY !== null ? fixed(silhouette.crotchY, 0) : '–'
          } · ${stats?.silhouetteMs != null ? `${fixed(stats.silhouetteMs, 1)} ms` : '–'}`
        : 'none',
    ],
    [
      'Saved captures',
      Object.values(captures)
        .map((c) => `${c.phase}: ${c.sampleCount} frames / ${Math.round(c.holdMs)} ms`)
        .join(' · ') || 'none',
    ],
    [
      'Saved outlines',
      Object.values(captures)
        .map((c) =>
          c.silhouette
            ? `${c.phase}: ${c.silhouette.frameCount} frames · jitter ${fixed(c.silhouette.widthJitter, 3)} · stature ${
                c.silhouette.headTopY !== null && c.silhouette.floorY !== null
                  ? fixed(c.silhouette.floorY - c.silhouette.headTopY, 0)
                  : '–'
              } px`
            : `${c.phase}: none`,
        )
        .join(' · ') || 'none',
    ],
  ];
  return (
    <section className="pose-debug" aria-label="Pose detection debug values" data-testid="pose-debug">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="pose-debug__row">
            <dt>{label}</dt>
            <dd data-key={label}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
