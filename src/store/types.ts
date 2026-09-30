import type { FitSlice } from './slices/fitSlice';
import type { SettingsSlice } from './slices/settingsSlice';
import type { UserSlice } from './slices/userSlice';

export type AppState = UserSlice & FitSlice & SettingsSlice;
