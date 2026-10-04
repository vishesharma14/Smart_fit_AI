import type { ScanViewId } from '../../types/scan';
import { SCAN_VIEWS, nearestView } from '../../utils/scan360/views';
import type { TrackingQuality } from '../../utils/scan360/trackingQuality';
import './ScanCoverage.css';

interface ScanCoverageProps {
  /** Views captured so far. */
  captured: ScanViewId[];
  /** View currently being held (capture in progress). */
  holdView: ScanViewId | null;
  /** Body angle estimated for the latest frame (degrees), while scanning. */
  liveYawDeg: number | null;
  tracking: TrackingQuality | null;
  /** Small horizontal variant for the full-screen phone scan. */
  compact?: boolean;
}

const SIZE = 120;
const R = 46;
const GAP_DEG = 8;

/** Point on the ring for a body angle: 0° at the top, turning left = clockwise, as seen from above. */
function point(deg: number, radius = R) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: SIZE / 2 + radius * Math.cos(rad), y: SIZE / 2 + radius * Math.sin(rad) };
}

function arc(fromDeg: number, toDeg: number) {
  const a = point(fromDeg);
  const b = point(toDeg);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * 360° coverage: one ring segment per view (filled once captured), a marker at
 * the body angle currently detected, and a tracking-quality pill. Everything
 * shown comes from the on-device detection results.
 */
export function ScanCoverage({ captured, holdView, liveYawDeg, tracking, compact = false }: ScanCoverageProps) {
  const count = captured.length;
  const marker = liveYawDeg === null ? null : point(liveYawDeg, R);
  const summary = `${count} of ${SCAN_VIEWS.length} views captured`;
  return (
    <div className={`scan-coverage${compact ? ' scan-coverage--compact' : ''}`}>
      <svg className="scan-coverage__ring" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {SCAN_VIEWS.map((view) => {
          const state = captured.includes(view.id) ? 'captured' : holdView === view.id ? 'holding' : 'pending';
          return (
            <path
              key={view.id}
              className={`scan-coverage__segment scan-coverage__segment--${state} scan-coverage__segment--${view.kind}`}
              d={arc(view.yawDeg - 22.5 + GAP_DEG / 2, view.yawDeg + 22.5 - GAP_DEG / 2)}
            />
          );
        })}
        {marker && <circle className="scan-coverage__marker" cx={marker.x} cy={marker.y} r={6} />}
        <text className="scan-coverage__count" x={SIZE / 2} y={SIZE / 2 + 2}>
          {count}/{SCAN_VIEWS.length}
        </text>
        <text className="scan-coverage__caption" x={SIZE / 2} y={SIZE / 2 + 18}>
          views
        </text>
      </svg>
      <div className="scan-coverage__info">
        <p className={`scan-coverage__summary${compact ? ' visually-hidden' : ''}`}>{summary}</p>
        {liveYawDeg !== null && (
          <p className="scan-coverage__angle">
            Detected: {nearestView(liveYawDeg).label} · {Math.round(liveYawDeg)}°
          </p>
        )}
        {tracking && (
          <p className={`scan-coverage__quality scan-coverage__quality--${tracking.level}`}>
            <span className="scan-coverage__quality-dot" aria-hidden="true" />
            Capture quality: {tracking.label}
          </p>
        )}
      </div>
    </div>
  );
}
