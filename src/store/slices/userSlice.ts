import type { StateCreator } from 'zustand';
import type { BodyMeasurements, ClothingSelection, UserInfo } from '../../types/domain';
import type { AppState } from '../types';

export interface UserSlice {
  userInfo: UserInfo;
  measurements: BodyMeasurements | null;
  clothingSelection: ClothingSelection | null;
  updateUserInfo: (patch: Partial<UserInfo>) => void;
  setMeasurements: (measurements: BodyMeasurements | null) => void;
  setClothingSelection: (selection: ClothingSelection | null) => void;
  resetUser: () => void;
}

const initialUserState = {
  userInfo: { name: '', gender: null, age: null, heightCm: null, weightKg: null },
  measurements: null,
  clothingSelection: null,
} satisfies Partial<UserSlice>;

export const createUserSlice: StateCreator<AppState, [], [], UserSlice> = (set) => ({
  ...initialUserState,
  updateUserInfo: (patch) => set((state) => ({ userInfo: { ...state.userInfo, ...patch } })),
  setMeasurements: (measurements) => set({ measurements }),
  setClothingSelection: (clothingSelection) => set({ clothingSelection }),
  resetUser: () => set(initialUserState),
});
