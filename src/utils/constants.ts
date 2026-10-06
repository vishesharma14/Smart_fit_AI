export const APP_NAME = 'SizerAI';
export const APP_TAGLINE = 'Perfect Fit. Powered by AI.';
export const APP_DESCRIPTION =
  'Estimate clothing-relevant measurements from a guided camera scan and get a personalized size recommendation — processed on your device, with every estimate shown for you to review.';

/** Builds a document title in the form "Page · SizerAI". */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : `${APP_NAME} — ${APP_TAGLINE}`;
}
