/** Date and time for saved results, e.g. "5 Oct 2026, 14:03". */
export function formatSavedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Where "Start a scan" leads: the scan page once a height is entered, else the details step first. */
export function startScanPath(heightCm: number | null, paths: { userInfo: string; scan: string }): string {
  return heightCm === null ? paths.userInfo : paths.scan;
}
