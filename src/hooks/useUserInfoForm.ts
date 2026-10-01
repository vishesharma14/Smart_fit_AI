import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { HeightUnit, UserInfo, WeightUnit } from '../types/domain';
import {
  type UserInfoDraft,
  type UserInfoErrors,
  type UserInfoField,
  USER_INFO_FIELD_ORDER,
  validateUserInfo,
} from '../utils/userInfoValidation';
import { cmToFeetInches, feetInchesToCm, formatForInput, kgToLb, lbToKg, parseNumber } from '../utils/units';

type DraftKey = keyof UserInfoDraft;

/** Which validation field each draft key belongs to. */
const FIELD_FOR_KEY: Record<DraftKey, UserInfoField> = {
  name: 'name',
  gender: 'gender',
  age: 'age',
  heightCm: 'height',
  heightFeet: 'height',
  heightInches: 'height',
  weight: 'weight',
};

function heightToDraft(cm: number | null, unit: HeightUnit): Pick<UserInfoDraft, 'heightCm' | 'heightFeet' | 'heightInches'> {
  if (cm === null) return { heightCm: '', heightFeet: '', heightInches: '' };
  if (unit === 'cm') return { heightCm: formatForInput(cm, 1), heightFeet: '', heightInches: '' };
  const { feet, inches } = cmToFeetInches(cm);
  return { heightCm: '', heightFeet: String(feet), heightInches: formatForInput(inches, 1) };
}

function weightToDraft(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return '';
  return formatForInput(unit === 'kg' ? kg : kgToLb(kg), 1);
}

/** Reads the height currently typed in the draft as centimetres, ignoring range limits. */
function draftHeightCm(draft: UserInfoDraft, unit: HeightUnit): number | null {
  if (unit === 'cm') return parseNumber(draft.heightCm);
  const feet = draft.heightFeet.trim() === '' ? 0 : parseNumber(draft.heightFeet);
  const inches = draft.heightInches.trim() === '' ? 0 : parseNumber(draft.heightInches);
  if (feet === null || inches === null || (feet === 0 && inches === 0)) return null;
  return feetInchesToCm(feet, inches);
}

function draftWeightKg(draft: UserInfoDraft, unit: WeightUnit): number | null {
  const value = parseNumber(draft.weight);
  if (value === null) return null;
  return unit === 'kg' ? value : lbToKg(value);
}

function toDraft(info: UserInfo, heightUnit: HeightUnit, weightUnit: WeightUnit): UserInfoDraft {
  return {
    name: info.name,
    gender: info.gender,
    age: info.age === null ? '' : String(info.age),
    ...heightToDraft(info.heightCm, heightUnit),
    weight: weightToDraft(info.weightKg, weightUnit),
  };
}

export interface UseUserInfoForm {
  draft: UserInfoDraft;
  heightUnit: HeightUnit;
  weightUnit: WeightUnit;
  /** Errors to display: only for fields the user has left, or all after a submit attempt. */
  visibleErrors: UserInfoErrors;
  submitAttempted: boolean;
  setValue: <K extends DraftKey>(key: K, value: UserInfoDraft[K]) => void;
  markTouched: (field: UserInfoField) => void;
  changeHeightUnit: (unit: HeightUnit) => void;
  changeWeightUnit: (unit: WeightUnit) => void;
  /** Saves to the store when valid. Returns the first invalid field, or null on success. */
  submit: () => UserInfoField | null;
}

/** Form state for the User Information step. Keeps raw text locally and saves canonical values to the store. */
export function useUserInfoForm(): UseUserInfoForm {
  const userInfo = useAppStore((s) => s.userInfo);
  const heightUnit = useAppStore((s) => s.heightUnit);
  const weightUnit = useAppStore((s) => s.weightUnit);
  const setHeightUnit = useAppStore((s) => s.setHeightUnit);
  const setWeightUnit = useAppStore((s) => s.setWeightUnit);
  const updateUserInfo = useAppStore((s) => s.updateUserInfo);

  const [draft, setDraft] = useState<UserInfoDraft>(() => toDraft(userInfo, heightUnit, weightUnit));
  const [touched, setTouched] = useState<ReadonlySet<UserInfoField>>(() => new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Exact canonical values from the last unit switch, so toggling units back and forth never drifts.
  const exactHeightCm = useRef<number | null>(userInfo.heightCm);
  const exactWeightKg = useRef<number | null>(userInfo.weightKg);

  const { errors, values } = useMemo(
    () => validateUserInfo(draft, heightUnit, weightUnit),
    [draft, heightUnit, weightUnit],
  );

  const visibleErrors = useMemo(() => {
    if (submitAttempted) return errors;
    const shown: UserInfoErrors = {};
    for (const field of USER_INFO_FIELD_ORDER) {
      if (touched.has(field) && errors[field]) shown[field] = errors[field];
    }
    return shown;
  }, [errors, touched, submitAttempted]);

  const setValue: UseUserInfoForm['setValue'] = (key, value) => {
    if (FIELD_FOR_KEY[key] === 'height') exactHeightCm.current = null;
    if (key === 'weight') exactWeightKg.current = null;
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const markTouched = (field: UserInfoField) => {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  };

  const changeHeightUnit = (unit: HeightUnit) => {
    if (unit === heightUnit) return;
    const cm = exactHeightCm.current ?? draftHeightCm(draft, heightUnit);
    exactHeightCm.current = cm;
    setDraft((prev) => ({ ...prev, ...heightToDraft(cm, unit) }));
    setHeightUnit(unit);
  };

  const changeWeightUnit = (unit: WeightUnit) => {
    if (unit === weightUnit) return;
    const kg = exactWeightKg.current ?? draftWeightKg(draft, weightUnit);
    exactWeightKg.current = kg;
    setDraft((prev) => ({ ...prev, weight: weightToDraft(kg, unit) }));
    setWeightUnit(unit);
  };

  const submit = () => {
    setSubmitAttempted(true);
    if (!values) return USER_INFO_FIELD_ORDER.find((field) => errors[field]) ?? null;
    updateUserInfo({
      ...values,
      // Keep full precision when the value came straight from a unit switch.
      heightCm: exactHeightCm.current ?? values.heightCm,
      weightKg: exactWeightKg.current ?? values.weightKg,
    });
    return null;
  };

  return {
    draft,
    heightUnit,
    weightUnit,
    visibleErrors,
    submitAttempted,
    setValue,
    markTouched,
    changeHeightUnit,
    changeWeightUnit,
    submit,
  };
}
