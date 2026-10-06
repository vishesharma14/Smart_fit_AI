import type { StateCreator } from 'zustand';
import type { SizePrediction } from '../../types/domain';
import type { FitProfile, ScanRecord } from '../../types/profile';
import { toScanRecord, upsertHistory } from '../../utils/profile/fitProfile';
import type { AppState } from '../types';

export interface FitSlice {
  prediction: SizePrediction | null;
  /** The user's saved fit profile (Step 11): on this device only, deletable. */
  fitProfile: FitProfile | null;
  /** Saved results, newest first (at most MAX_SCAN_HISTORY; each a numbers-only snapshot incl. its measurements). */
  scanHistory: ScanRecord[];
  setPrediction: (prediction: SizePrediction | null) => void;
  /** Saves the profile and records it in the history (re-saving the same scan updates its entry). */
  saveFitProfile: (profile: FitProfile) => void;
  /** Deletes the saved profile and the history. */
  deleteFitProfile: () => void;
  resetFit: () => void;
}

const initialFitState = {
  prediction: null,
  fitProfile: null,
  scanHistory: [],
} satisfies Partial<FitSlice>;

export const createFitSlice: StateCreator<AppState, [], [], FitSlice> = (set) => ({
  ...initialFitState,
  setPrediction: (prediction) => set({ prediction }),
  saveFitProfile: (profile) =>
    set((state) => ({ fitProfile: profile, scanHistory: upsertHistory(state.scanHistory, toScanRecord(profile)) })),
  deleteFitProfile: () => set({ fitProfile: null, scanHistory: [] }),
  resetFit: () => set(initialFitState),
});
