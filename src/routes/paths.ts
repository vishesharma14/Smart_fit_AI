/** Central list of application paths. Add a path here only when its route exists. */
export const PATHS = {
  home: '/',
  userInfo: '/details',
  clothing: '/clothing',
  scan: '/scan',
  measurements: '/measurements',
  results: '/results',
  profile: '/profile',
  privacy: '/privacy',
  demoScan: '/demo/scan',
} as const;

/** Where the Welcome page's Start button leads. `null` hides navigation and shows the button as unavailable. */
export const WELCOME_NEXT_PATH: string | null = PATHS.userInfo;
