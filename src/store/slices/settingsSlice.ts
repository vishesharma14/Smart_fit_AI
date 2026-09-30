import type { StateCreator } from 'zustand';
import type { ThemePreference, UnitSystem } from '../../types/domain';
import type { AppState } from '../types';

export interface SettingsSlice {
  units: UnitSystem;
  theme: ThemePreference;
  setUnits: (units: UnitSystem) => void;
  setTheme: (theme: ThemePreference) => void;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
  units: 'metric',
  theme: 'dark',
  setUnits: (units) => set({ units }),
  setTheme: (theme) => set({ theme }),
});
