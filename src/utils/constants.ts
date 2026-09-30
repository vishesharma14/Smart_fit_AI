export const APP_NAME = 'SizerAI';
export const APP_TAGLINE = 'Perfect Fit. Powered by AI.';
export const APP_DESCRIPTION =
  'SizerAI helps you find the clothing size that actually fits, based on your body — not guesswork. Answer a few questions and get a size recommendation you can shop with confidence.';

/** Builds a document title in the form "Page · SizerAI". */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : `${APP_NAME} — ${APP_TAGLINE}`;
}
