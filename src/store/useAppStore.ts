import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '../services/storage';
import { createFitSlice } from './slices/fitSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createUserSlice } from './slices/userSlice';
import type { AppState } from './types';

/**
 * Global application store, composed from feature slices.
 *
 * Only non-sensitive preferences (units, theme) are persisted. Body data,
 * predictions and scan history stay in memory until a later step explicitly
 * implements and justifies storing them.
 */
export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createUserSlice(...args),
      ...createFitSlice(...args),
      ...createSettingsSlice(...args),
    }),
    {
      name: 'sizerai-settings',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ units: state.units, theme: state.theme }),
    },
  ),
);
