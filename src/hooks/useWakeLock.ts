import { useEffect } from 'react';

/**
 * Keeps the screen awake while `active` (e.g. while the camera is on for a
 * scan), using the Screen Wake Lock API where the browser supports it. The
 * lock is re-requested when the page becomes visible again (browsers release
 * it when the tab is hidden) and released when inactive. Unsupported or
 * refused: silently does nothing — the scan works either way.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== 'visible' || lock) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        lock = sentinel;
        sentinel.addEventListener('release', () => {
          if (lock === sentinel) lock = null;
        });
      } catch {
        // Refused (e.g. low battery or no user activation): the scan continues without it.
      }
    };

    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
