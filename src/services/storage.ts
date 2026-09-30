import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage wrapper that never throws.
 *
 * Storage can be unavailable (private browsing, blocked site data, quota
 * exceeded). In those cases the app keeps working with in-memory state only.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Ignore write failures; state remains in memory.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore removal failures.
    }
  },
};
