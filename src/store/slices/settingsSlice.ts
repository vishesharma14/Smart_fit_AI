import type { StateCreator } from 'zustand';
import type { HeightUnit, ThemePreference, WeightUnit } from '../../types/domain';
import type { AppState } from '../types';

export interface SettingsSlice {
  heightUnit: HeightUnit;
  weightUnit: WeightUnit;
  theme: ThemePreference;
  /** Spoken scan guidance (browser speech synthesis). */
  voiceGuidance: boolean;
  setHeightUnit: (unit: HeightUnit) => void;
  setWeightUnit: (unit: WeightUnit) => void;
  setTheme: (theme: ThemePreference) => void;
  setVoiceGuidance: (enabled: boolean) => void;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
  heightUnit: 'cm',
  weightUnit: 'kg',
  theme: 'dark',
  voiceGuidance: true,
  setHeightUnit: (heightUnit) => set({ heightUnit }),
  setWeightUnit: (weightUnit) => set({ weightUnit }),
  setTheme: (theme) => set({ theme }),
  setVoiceGuidance: (voiceGuidance) => set({ voiceGuidance }),
});
