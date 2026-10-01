import type { Gender, HeightUnit, UserInfo, WeightUnit } from '../types/domain';
import { CM_PER_INCH, INCHES_PER_FOOT, feetInchesToCm, lbToKg, LB_PER_KG, parseNumber } from './units';

/** Raw form values as typed by the user (strings until validated). */
export interface UserInfoDraft {
  name: string;
  gender: Gender | null;
  age: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weight: string;
}

export type UserInfoField = 'name' | 'gender' | 'age' | 'height' | 'weight';

export type UserInfoErrors = Partial<Record<UserInfoField, string>>;

/** Order used for error summaries and focusing the first invalid field. */
export const USER_INFO_FIELD_ORDER: UserInfoField[] = ['name', 'gender', 'age', 'height', 'weight'];

export const NAME_MAX_LENGTH = 50;

export const AGE_LIMITS: Record<Gender, { min: number; max: number }> = {
  men: { min: 13, max: 100 },
  women: { min: 13, max: 100 },
  children: { min: 10, max: 17 },
};

/** Plausible self-reported ranges, stored in canonical units. */
export const HEIGHT_LIMITS_CM = { min: 100, max: 250 };
export const WEIGHT_LIMITS_KG = { min: 25, max: 300 };

function feetInchesLabel(totalInches: number): string {
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  return `${feet} ft ${totalInches - feet * INCHES_PER_FOOT} in`;
}

function heightRangeMessage(unit: HeightUnit): string {
  if (unit === 'cm') {
    return `Enter a height between ${HEIGHT_LIMITS_CM.min} and ${HEIGHT_LIMITS_CM.max} cm.`;
  }
  const min = Math.ceil(HEIGHT_LIMITS_CM.min / CM_PER_INCH);
  const max = Math.floor(HEIGHT_LIMITS_CM.max / CM_PER_INCH);
  return `Enter a height between ${feetInchesLabel(min)} and ${feetInchesLabel(max)}.`;
}

function weightRangeMessage(unit: WeightUnit): string {
  if (unit === 'kg') {
    return `Enter a weight between ${WEIGHT_LIMITS_KG.min} and ${WEIGHT_LIMITS_KG.max} kg.`;
  }
  const min = Math.ceil(WEIGHT_LIMITS_KG.min * LB_PER_KG);
  const max = Math.floor(WEIGHT_LIMITS_KG.max * LB_PER_KG);
  return `Enter a weight between ${min} and ${max} lb.`;
}

function validateAge(text: string, gender: Gender | null): { error?: string; value: number | null } {
  if (text.trim() === '') return { error: 'Please enter your age.', value: null };
  const age = parseNumber(text);
  if (age === null || !Number.isInteger(age)) return { error: 'Enter your age in whole years.', value: null };

  if (gender === 'children') {
    const { min, max } = AGE_LIMITS.children;
    if (age < min || age > max) return { error: `Children's sizing covers ages ${min}–${max}.`, value: null };
  } else if (gender) {
    const { min, max } = AGE_LIMITS[gender];
    if (age < min) return { error: `This size range starts at age ${min}. Try Children 10+.`, value: null };
    if (age > max) return { error: `Please enter an age between ${min} and ${max}.`, value: null };
  } else if (age < AGE_LIMITS.children.min || age > AGE_LIMITS.men.max) {
    return { error: `Please enter an age between ${AGE_LIMITS.children.min} and ${AGE_LIMITS.men.max}.`, value: null };
  }
  return { value: age };
}

function validateHeight(draft: UserInfoDraft, unit: HeightUnit): { error?: string; value: number | null } {
  let cm: number | null;

  if (unit === 'cm') {
    if (draft.heightCm.trim() === '') return { error: 'Please enter your height.', value: null };
    cm = parseNumber(draft.heightCm);
    if (cm === null) return { error: 'Height should be a number.', value: null };
  } else {
    const feetText = draft.heightFeet.trim();
    const inchesText = draft.heightInches.trim();
    if (feetText === '' && inchesText === '') return { error: 'Please enter your height.', value: null };
    const feet = feetText === '' ? 0 : parseNumber(feetText);
    const inches = inchesText === '' ? 0 : parseNumber(inchesText);
    if (feet === null || inches === null) return { error: 'Height should be a number.', value: null };
    if (!Number.isInteger(feet)) return { error: 'Enter feet as a whole number.', value: null };
    if (inches >= INCHES_PER_FOOT) return { error: 'Inches should be less than 12.', value: null };
    cm = feetInchesToCm(feet, inches);
  }

  if (cm < HEIGHT_LIMITS_CM.min || cm > HEIGHT_LIMITS_CM.max) return { error: heightRangeMessage(unit), value: null };
  return { value: cm };
}

function validateWeight(text: string, unit: WeightUnit): { error?: string; value: number | null } {
  if (text.trim() === '') return { error: 'Please enter your weight.', value: null };
  const entered = parseNumber(text);
  if (entered === null) return { error: 'Weight should be a number.', value: null };
  const kg = unit === 'kg' ? entered : lbToKg(entered);
  if (kg < WEIGHT_LIMITS_KG.min || kg > WEIGHT_LIMITS_KG.max) return { error: weightRangeMessage(unit), value: null };
  return { value: kg };
}

export interface UserInfoValidationResult {
  errors: UserInfoErrors;
  /** Canonical values, present only when the whole draft is valid. */
  values: UserInfo | null;
}

export function validateUserInfo(
  draft: UserInfoDraft,
  heightUnit: HeightUnit,
  weightUnit: WeightUnit,
): UserInfoValidationResult {
  const errors: UserInfoErrors = {};

  const name = draft.name.trim();
  if (name.length > NAME_MAX_LENGTH) errors.name = `Keep your name under ${NAME_MAX_LENGTH} characters.`;

  if (!draft.gender) errors.gender = 'Choose the size range you shop in.';

  const age = validateAge(draft.age, draft.gender);
  if (age.error) errors.age = age.error;

  const height = validateHeight(draft, heightUnit);
  if (height.error) errors.height = height.error;

  const weight = validateWeight(draft.weight, weightUnit);
  if (weight.error) errors.weight = weight.error;

  const valid = Object.keys(errors).length === 0;
  return {
    errors,
    values: valid
      ? { name, gender: draft.gender, age: age.value, heightCm: height.value, weightKg: weight.value }
      : null,
  };
}
