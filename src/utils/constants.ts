export const APP_NAME = 'SizerAI';
export const APP_TAGLINE = 'Perfect Fit. Powered by AI.';
export const APP_DESCRIPTION =
  'Scan your body with your camera, review the estimated measurements, and get a clothing size recommendation from a transparent size-chart comparison — processed on your device.';

/** Builds a document title in the form "Page · SizerAI". */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : `${APP_NAME} — ${APP_TAGLINE}`;
}
