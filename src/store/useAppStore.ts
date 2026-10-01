import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '../services/storage';
import { createFitSlice } from './slices/fitSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createUserSlice } from './slices/userSlice';
import type { ThemePreference } from '../types/domain';
import type { AppState } from './types';

/**
 * Global application store, composed from feature slices.
 *
 * Only non-sensitive preferences (display units, theme) are persisted. User
 * information, body data, predictions and scan history stay in memory until a
 * later step explicitly implements and justifies storing them.
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
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ heightUnit: state.heightUnit, weightUnit: state.weightUnit, theme: state.theme }),
      // v1 stored a single `units` system; map it onto the separate height/weight units.
      migrate: (persisted) => {
        const v1 = (persisted ?? {}) as { units?: string; theme?: ThemePreference };
        const imperial = v1.units === 'imperial';
        return {
          heightUnit: imperial ? 'ft-in' : 'cm',
          weightUnit: imperial ? 'lb' : 'kg',
          theme: v1.theme ?? 'dark',
        } satisfies Pick<AppState, 'heightUnit' | 'weightUnit' | 'theme'>;
      },
    },
  ),
);
