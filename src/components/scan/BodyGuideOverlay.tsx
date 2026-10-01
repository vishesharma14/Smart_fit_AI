import './BodyGuideOverlay.css';

interface BodyGuideOverlayProps {
  /** Front/back views use a frontal outline; side views use a profile outline. */
  view: 'frontal' | 'profile';
}

const FRONTAL_BODY =
  'M139 94v8q-31 4-40 16l-14 96q-2 12 8 12l8-66 6 68 6 144h27l8-116h4l8 116h27l6-144 6-68 8 66q10 0 8-12l-14-96q-9-12-40-16v-8';

const PROFILE_BODY =
  'M145 92v10q-17 5-18 24l2 94 7 12 2 140h24l2-140q8-32 6-72 2-40-11-54l-5-4v-10';

/**
 * Static positioning guide drawn over the camera preview: frame corners and a
 * dashed body outline. It is a visual aid only and does not detect anything.
 */
export function BodyGuideOverlay({ view }: BodyGuideOverlayProps) {
  return (
    <svg className="body-guide" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="body-guide__corners">
        <path d="M24 64V32h32" />
        <path d="M244 32h32v32" />
        <path d="M276 336v32h-32" />
        <path d="M56 368H24v-32" />
      </g>
      <g className="body-guide__figure">
        <circle cx="150" cy="68" r={view === 'frontal' ? 24 : 22} />
        <path d={view === 'frontal' ? FRONTAL_BODY : PROFILE_BODY} />
      </g>
    </svg>
  );
}
