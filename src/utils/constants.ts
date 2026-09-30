export const APP_NAME = 'SizerAI';
export const APP_TAGLINE = 'Perfect Fit. Powered by AI.';

/** Builds a document title in the form "Page · SizerAI". */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : `${APP_NAME} — ${APP_TAGLINE}`;
}
