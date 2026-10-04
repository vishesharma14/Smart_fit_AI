import type { UseCamera } from '../../hooks/useCamera';
import type { PoseScanState } from '../../hooks/usePoseScan';
import { POSE_MODEL_NAME } from '../../services/pose/poseLandmarker';
import { useAppStore } from '../../store/useAppStore';
import type { ScanCapture, ScanViewId } from '../../types/scan';
import { silhouetteScale } from '../../utils/measurement/calibration';
import type { ScanRegionDefinition } from '../../utils/pose/scanRegions';
import type { Coverage } from '../../utils/scan360/session';
import './PoseDebugPanel.css';

const fixed = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value) ? '–' : value.toFixed(digits);

/** Developer readout (enabled with `?poseDebug`) of the live detection values behind the guidance. */
interface PoseDebugPanelProps {
  pose: PoseScanState;
  camera: UseCamera;
  scanRegion: ScanRegionDefinition;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  coverage: Coverage;
}

export function PoseDebugPanel({ pose, camera, scanRegion, captures, coverage }: PoseDebugPanelProps) {
  const userHeightCm = useAppStore((s) => s.userInfo.heightCm);
  const { decision, yaw, outline, frameCounts } = pose;
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
    ['Body angle', yaw ? `${fixed(yaw.yawDeg, 0)}° (confidence ${fixed(yaw.confidence)})` : '–'],
    [
      'Frame',
      decision ? `${decision.accept ? 'accepted' : `rejected: ${decision.reason}`} · window ${decision.view ?? 'between views'}` : '–',
    ],
    [
      'Frames',
      `accepted ${frameCounts.accepted} · ${
        Object.entries(frameCounts)
          .filter(([key]) => key !== 'accepted')
          .map(([key, n]) => `${key} ${n}`)
          .join(' · ') || 'no rejections'
      }`,
    ],
    [
      'Outline quality',
      outline
        ? `${outline.issue ?? 'ok'} · sharpness ${fixed(outline.sharpness)} · vs joints ${fixed(outline.disagreement)}`
        : 'not read',
    ],
    ['Hold', `${pose.holdView ?? '–'} · ${fixed(pose.holdProgress)}${pose.lastHoldFailure ? ` · last discarded: ${pose.lastHoldFailure}` : ''}`],
    [
      'Coverage',
      `${coverage.captured.join(', ') || 'none'} · missing cardinal: ${coverage.missingCardinal.join(', ') || 'none'} · ${
        coverage.complete ? 'complete' : coverage.canFinishEarly ? 'can finish early' : 'insufficient'
      }`,
    ],
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
        .map((c) => `${c.phase} @ ${fixed(c.yawDeg, 0)}°: ${c.sampleCount} frames / ${Math.round(c.holdMs)} ms`)
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
    [
      'Calibration',
      `front width ratio ${fixed(captures.front?.widthRatio)} · outline scale: ${
        Object.values(captures)
          .map((c) => {
            const scale = silhouetteScale(c, userHeightCm);
            return `${c.phase} ${scale ? `${fixed(scale.cmPerPx, 3)} cm/px (${fixed(scale.confidence)})` : 'rejected'}`;
          })
          .join(' · ') || '–'
      }`,
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
