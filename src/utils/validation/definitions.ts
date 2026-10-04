import type {
  ClothingFit,
  LightingCondition,
  ValidationCameraType,
  ValidationDeviceType,
  ValidationMeasurementId,
  WornClothingType,
} from '../../types/validation';

/*
 * Measurements compared in real-person validation (Step 9E-3A) and the labels of the scan metadata.
 *
 * The plausible ranges only catch typing mistakes (e.g. 9 instead of 90, or inches typed as cm). They are wide
 * on purpose and say nothing about what a body should measure.
 */

export interface ValidationMeasurementDefinition {
  id: ValidationMeasurementId;
  label: string;
  /** How to take the tape measurement. */
  tapeHint: string;
  /** Accepted range (cm). */
  minCm: number;
  maxCm: number;
}

export const VALIDATION_MEASUREMENTS: readonly ValidationMeasurementDefinition[] = [
  { id: 'chest', label: 'Chest', tapeHint: 'Horizontal girth over the fullest part of the chest, arms down.', minCm: 40, maxCm: 200 },
  { id: 'waist', label: 'Waist', tapeHint: 'Horizontal girth at the natural waist (narrowest part of the torso).', minCm: 35, maxCm: 200 },
  { id: 'hip', label: 'Hip', tapeHint: 'Horizontal girth over the widest part of the hips and seat.', minCm: 45, maxCm: 200 },
  { id: 'thigh', label: 'Thigh', tapeHint: 'Girth of one thigh just below the crotch.', minCm: 20, maxCm: 110 },
  { id: 'inseam', label: 'Inseam', tapeHint: 'Crotch to the floor along the inside of the leg, barefoot.', minCm: 25, maxCm: 120 },
  { id: 'shoulder-width', label: 'Shoulder width', tapeHint: 'Straight distance between the shoulder joints.', minCm: 20, maxCm: 70 },
  { id: 'arm-length', label: 'Arm length', tapeHint: 'Shoulder joint to wrist with the arm straight.', minCm: 25, maxCm: 100 },
  { id: 'leg-length', label: 'Leg length', tapeHint: 'Hip joint to ankle with the leg straight.', minCm: 35, maxCm: 130 },
];

export const VALIDATION_MEASUREMENT_IDS: readonly ValidationMeasurementId[] = VALIDATION_MEASUREMENTS.map((m) => m.id);

export const VALIDATION_LABELS: Record<ValidationMeasurementId, string> = Object.fromEntries(
  VALIDATION_MEASUREMENTS.map((m) => [m.id, m.label]),
) as Record<ValidationMeasurementId, string>;

/** Accepted tape-measured height (cm). */
export const VALIDATION_HEIGHT_RANGE = { minCm: 80, maxCm: 250 } as const;

/** Anonymous codes only: letters, digits and hyphens (no spaces, so no full names or e-mail addresses). */
export const SUBJECT_ID_PATTERN = /^[A-Za-z0-9-]{2,24}$/;

export const MAX_NOTES_LENGTH = 200;

export const CLOTHING_FIT_LABELS: Record<ClothingFit, string> = { fitted: 'Fitted', normal: 'Normal', loose: 'Loose' };

export const WORN_CLOTHING_LABELS: Record<WornClothingType, string> = {
  activewear: 'Activewear (tight)',
  't-shirt-shorts': 'T-shirt + shorts',
  't-shirt-trousers': 'T-shirt + trousers',
  'shirt-trousers': 'Shirt + trousers',
  'dress-skirt': 'Dress / skirt',
  other: 'Other',
};

export const DEVICE_LABELS: Record<ValidationDeviceType, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  laptop: 'Laptop',
  desktop: 'Desktop',
};

export const CAMERA_LABELS: Record<ValidationCameraType, string> = {
  rear: 'Rear camera',
  front: 'Front camera',
  webcam: 'Built-in webcam',
  external: 'External camera',
};

export const LIGHTING_LABELS: Record<LightingCondition, string> = {
  'bright-even': 'Bright, even',
  'normal-indoor': 'Normal indoor',
  dim: 'Dim',
  backlit: 'Backlit',
  mixed: 'Mixed',
};
