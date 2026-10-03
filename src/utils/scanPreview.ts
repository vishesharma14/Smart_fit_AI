/** Default preview shape (width ÷ height): portrait, suited to a standing person. */
const DEFAULT_PREVIEW_ASPECT = 3 / 4;
/** Narrowest preview allowed, so an unusual stream can't make the preview absurdly tall. */
const MIN_PREVIEW_ASPECT = 9 / 16;

/**
 * Preview shape for the delivered video. The preview fills its box
 * (`object-fit: cover`), so a video narrower than 3:4 (a portrait phone
 * stream) would lose its top and bottom — exactly where the head and feet
 * are. For those streams the preview takes the video's own shape instead, so
 * the full height of the camera's view stays visible. Wider (landscape)
 * streams keep 3:4: only their sides are trimmed, which never hides the head
 * or feet.
 */
export function previewAspectRatio(
  videoSize: { width: number; height: number } | null,
  /** Show the video in its own shape whatever it is (e.g. a phone held in landscape has room for it). */
  native = false,
): number {
  if (!videoSize) return DEFAULT_PREVIEW_ASPECT;
  const aspect = videoSize.width / videoSize.height;
  if (native) return Math.max(aspect, MIN_PREVIEW_ASPECT);
  return aspect < DEFAULT_PREVIEW_ASPECT ? Math.max(aspect, MIN_PREVIEW_ASPECT) : DEFAULT_PREVIEW_ASPECT;
}
