import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '../services/storage';
import { createFitSlice } from './slices/fitSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createUserSlice } from './slices/userSlice';
import type { ThemePreference } from '../types/domain';
import type { AppState } from './types';
import { isScanRecord, normalizeFitProfile } from '../utils/profile/fitProfile';

/**
 * Global application store, composed from feature slices.
 *
 * Persisted on this device (browser storage) only: display preferences (units, theme, voice guidance) and,
 * once the user explicitly saves it, the fit profile and its short history (Step 11: numbers only — no images,
 * frames, landmarks or outlines — so a saved size survives a reload; the user can delete it). User information,
 * scan results and unsaved measurements stay in memory.
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
      partialize: (state) => ({
        heightUnit: state.heightUnit,
        weightUnit: state.weightUnit,
        theme: state.theme,
        voiceGuidance: state.voiceGuidance,
        fitProfile: state.fitProfile,
        scanHistory: state.scanHistory,
      }),
      // Stored data may be malformed or from an older version: keep only valid profile / history entries.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...stored,
          fitProfile: normalizeFitProfile(stored.fitProfile),
          scanHistory: Array.isArray(stored.scanHistory) ? stored.scanHistory.filter(isScanRecord) : [],
        };
      },
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
