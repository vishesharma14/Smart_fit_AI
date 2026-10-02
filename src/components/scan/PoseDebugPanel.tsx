import type { UseCamera } from '../../hooks/useCamera';
import type { PoseScanState } from '../../hooks/usePoseScan';
import { POSE_MODEL_NAME } from '../../services/pose/poseLandmarker';
import './PoseDebugPanel.css';

const fixed = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value) ? '–' : value.toFixed(digits);

/** Developer readout (enabled with `?poseDebug`) of the live detection values behind the guidance. */
export function PoseDebugPanel({ pose, camera }: { pose: PoseScanState; camera: UseCamera }) {
  const { assessment, stats } = pose;
  const orientation = assessment?.orientation;
  const metrics = assessment?.metrics;
  const { videoSize, zoom } = camera;
  const rows: [string, string][] = [
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
      'Signals',
      orientation
        ? Object.entries(orientation.signals)
            .map(([name, value]) => `${name} ${fixed(value, 1)}`)
            .join(' · ')
        : '–',
    ],
    ['Body height', fixed(metrics?.bodyHeight)],
    ['Tilt', metrics ? `${fixed(metrics.torsoTiltDeg, 1)}°` : '–'],
    ['Arms', metrics ? `${fixed(metrics.armAnglesDeg[0], 0)}° / ${fixed(metrics.armAnglesDeg[1], 0)}°` : '–'],
    ['Stance', fixed(metrics?.stanceRatio)],
    ['Jitter', `${fixed(pose.jitter, 3)}${pose.moving ? ' (moving)' : ''}`],
    ['Hold', fixed(pose.holdProgress)],
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
