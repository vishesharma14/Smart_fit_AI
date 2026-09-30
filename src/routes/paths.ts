/** Central list of application paths. Add a path here only when its route exists. */
export const PATHS = {
  home: '/',
} as const;

/**
 * Where the Welcome page's Start button leads. `null` while the next step
 * (User Information) has not been built; the button shows as unavailable.
 */
export const WELCOME_NEXT_PATH: string | null = null;
