import type { StateCreator } from 'zustand';
import type { FitProfile, ScanRecord, SizePrediction } from '../../types/domain';
import type { AppState } from '../types';

export interface FitSlice {
  prediction: SizePrediction | null;
  fitProfile: FitProfile | null;
  scanHistory: ScanRecord[];
  setPrediction: (prediction: SizePrediction | null) => void;
  setFitProfile: (profile: FitProfile | null) => void;
  addScanRecord: (record: ScanRecord) => void;
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
  setFitProfile: (fitProfile) => set({ fitProfile }),
  addScanRecord: (record) => set((state) => ({ scanHistory: [record, ...state.scanHistory] })),
  resetFit: () => set(initialFitState),
});
