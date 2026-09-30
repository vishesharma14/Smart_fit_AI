import type { StateCreator } from 'zustand';
import type { BodyMeasurements, ClothingCategoryId, UserInfo } from '../../types/domain';
import type { AppState } from '../types';

export interface UserSlice {
  userInfo: UserInfo;
  measurements: BodyMeasurements | null;
  selectedCategoryId: ClothingCategoryId | null;
  updateUserInfo: (patch: Partial<UserInfo>) => void;
  setMeasurements: (measurements: BodyMeasurements | null) => void;
  setSelectedCategoryId: (categoryId: ClothingCategoryId | null) => void;
  resetUser: () => void;
}

const initialUserState = {
  userInfo: { heightCm: null, weightKg: null },
  measurements: null,
  selectedCategoryId: null,
} satisfies Partial<UserSlice>;

export const createUserSlice: StateCreator<AppState, [], [], UserSlice> = (set) => ({
  ...initialUserState,
  updateUserInfo: (patch) => set((state) => ({ userInfo: { ...state.userInfo, ...patch } })),
  setMeasurements: (measurements) => set({ measurements }),
  setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
  resetUser: () => set(initialUserState),
});
