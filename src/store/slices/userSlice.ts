import type { StateCreator } from 'zustand';
import type { ClothingSelection, UserInfo } from '../../types/domain';
import type { ConfirmedMeasurements, ScanMeasurementResult } from '../../types/measurement';
import type { AppState } from '../types';

export interface UserSlice {
  userInfo: UserInfo;
  /** Measurements the user reviewed and confirmed (from the measurement engine, possibly edited). */
  measurements: ConfirmedMeasurements | null;
  /** The latest completed scan's measurement engine output, waiting for review. */
  scanMeasurements: ScanMeasurementResult | null;
  clothingSelection: ClothingSelection | null;
  updateUserInfo: (patch: Partial<UserInfo>) => void;
  setMeasurements: (measurements: ConfirmedMeasurements | null) => void;
  /** A new scan result replaces the previous one and clears measurements confirmed from an older scan. */
  setScanMeasurements: (result: ScanMeasurementResult | null) => void;
  setClothingSelection: (selection: ClothingSelection | null) => void;
  resetUser: () => void;
}

const initialUserState = {
  userInfo: { name: '', gender: null, age: null, heightCm: null, weightKg: null },
  measurements: null,
  scanMeasurements: null,
  clothingSelection: null,
} satisfies Partial<UserSlice>;

export const createUserSlice: StateCreator<AppState, [], [], UserSlice> = (set) => ({
  ...initialUserState,
  updateUserInfo: (patch) => set((state) => ({ userInfo: { ...state.userInfo, ...patch } })),
  setMeasurements: (measurements) => set({ measurements }),
  setScanMeasurements: (scanMeasurements) =>
    set((state) => ({
      scanMeasurements,
      measurements: state.measurements && state.measurements.measuredAt === scanMeasurements?.measuredAt ? state.measurements : null,
    })),
  setClothingSelection: (clothingSelection) => set({ clothingSelection }),
  resetUser: () => set(initialUserState),
});
