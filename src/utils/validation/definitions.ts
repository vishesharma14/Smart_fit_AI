import type {
  ClothingFit,
  LightingCondition,
  MeasuringSide,
  ValidationCameraType,
  ValidationDeviceType,
  ValidationMeasurementGroup,
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
  group: ValidationMeasurementGroup;
  /** Short reminder shown under the input. */
  tapeHint: string;
  /** Standardized protocol steps (Step 9E-3B). */
  protocol: readonly string[];
  /** One-sided measurement: the side used must be recorded. */
  sided?: boolean;
  /** The method must be described in the notes. */
  notesRequired?: boolean;
  /** Accepted range (cm). */
  minCm: number;
  maxCm: number;
}

export const VALIDATION_MEASUREMENTS: readonly ValidationMeasurementDefinition[] = [
  {
    id: 'chest',
    label: 'Chest',
    group: 'circumference',
    tapeHint: 'Horizontal, fullest part of the chest, relaxed breathing.',
    protocol: [
      'Tape horizontal around the fullest part of the chest.',
      'Arms relaxed naturally at the sides.',
      'Tape snug but not compressing the body.',
      'Read the value during normal relaxed breathing.',
    ],
    minCm: 40,
    maxCm: 200,
  },
  {
    id: 'waist',
    label: 'Waist',
    group: 'circumference',
    tapeHint: 'Horizontal, natural waist level (same level every time).',
    protocol: [
      'Tape horizontal around the natural waist — use the same torso level consistently for this subject.',
      'Do not suck in the stomach.',
      'Do not compress the body.',
    ],
    minCm: 35,
    maxCm: 200,
  },
  {
    id: 'hip',
    label: 'Hip',
    group: 'circumference',
    tapeHint: 'Horizontal, fullest part of the hips/glutes.',
    protocol: ['Tape around the fullest part of the hips/glutes.', 'Keep the tape horizontal.', 'Do not compress the body.'],
    minCm: 45,
    maxCm: 200,
  },
  {
    id: 'thigh',
    label: 'Thigh',
    group: 'circumference',
    tapeHint: 'Fullest part of one upper thigh; record the side.',
    protocol: [
      'Tape around the fullest part of one upper thigh.',
      'Record the side used.',
      'Use the same side for repeated scans.',
    ],
    sided: true,
    minCm: 20,
    maxCm: 110,
  },
  {
    id: 'inseam',
    label: 'Inseam',
    group: 'length',
    tapeHint: 'Crotch point vertically down to the floor, barefoot.',
    protocol: [
      'From the crotch point vertically down to the floor, barefoot (the app measures crotch → floor on the body outline).',
      'Use the same method for every repeated scan.',
    ],
    minCm: 25,
    maxCm: 120,
  },
  {
    id: 'shoulder-width',
    label: 'Shoulder width',
    group: 'length',
    tapeHint: 'Same shoulder points every time; describe the method in notes.',
    protocol: [
      'Measure between the same anatomical shoulder points for every subject (the app uses the distance between the shoulder joint centres).',
      'Record the exact method in the notes (e.g. "acromion to acromion, straight, tape behind").',
    ],
    notesRequired: true,
    minCm: 20,
    maxCm: 70,
  },
  {
    id: 'arm-length',
    label: 'Arm length',
    group: 'length',
    tapeHint: 'Same shoulder point to the wrist; record the arm used.',
    protocol: [
      'From the same shoulder reference point to the wrist, arm straight and relaxed (the app measures shoulder joint → wrist joint).',
      'Use the same arm for repeated measurements; record which one.',
    ],
    sided: true,
    minCm: 25,
    maxCm: 100,
  },
  {
    id: 'leg-length',
    label: 'Leg length',
    group: 'length',
    tapeHint: 'Same anatomical endpoints every time; describe the method in notes.',
    protocol: [
      'Use the same anatomical endpoints for every subject (the app measures hip joint → ankle joint).',
      'Record the method in the notes (e.g. "greater trochanter to lateral malleolus").',
    ],
    notesRequired: true,
    minCm: 35,
    maxCm: 130,
  },
];

export const HEIGHT_PROTOCOL: readonly string[] = [
  'Barefoot.',
  'Stand upright against a wall.',
  'Measure from the floor to the top of the head.',
];

export const GENERAL_PROTOCOL: readonly string[] = [
  'Use centimetres.',
  'The person stands naturally and relaxed — no sucking in the stomach, no intentionally expanding the chest.',
  'Take every measurement the same way for every scan of the same person.',
];

export const PROTOCOL_DISCLAIMER =
  'These instructions are a consistency guide, not a claim that they exactly reproduce every ISO or tailoring protocol.';

export const SCAN_PROCEDURE: readonly string[] = [
  'Enter the manual tape measurements first.',
  'Enter the person’s actual (tape) height — here and on the details page, which scales the scan.',
  'Record the clothing type and fit (start with fitted clothing).',
  'Record the device, camera and lighting.',
  'Start the normal SizerAI 360° scan.',
  'Complete the scan naturally.',
  'Do not alter the scan results.',
  'Let the current ellipse engine and the Anny shadow process the same scan.',
  'Record the scan here (incomplete or invalid scans are recorded as unusable).',
  'Restart the scan and repeat at least once for the same person — the tape values stay the same.',
];

export const GROUP_LABELS: Record<ValidationMeasurementGroup, string> = {
  circumference: 'Circumferences',
  length: 'Lengths',
};

export const SIDE_LABELS: Record<MeasuringSide, string> = { left: 'Left', right: 'Right' };

export const VALIDATION_MEASUREMENT_IDS: readonly ValidationMeasurementId[] = VALIDATION_MEASUREMENTS.map((m) => m.id);

export const VALIDATION_LABELS: Record<ValidationMeasurementId, string> = Object.fromEntries(
  VALIDATION_MEASUREMENTS.map((m) => [m.id, m.label]),
) as Record<ValidationMeasurementId, string>;

export const VALIDATION_GROUP: Record<ValidationMeasurementId, ValidationMeasurementGroup> = Object.fromEntries(
  VALIDATION_MEASUREMENTS.map((m) => [m.id, m.group]),
) as Record<ValidationMeasurementId, ValidationMeasurementGroup>;

export const VALIDATION_GROUPS: readonly ValidationMeasurementGroup[] = ['circumference', 'length'];

/** Accepted tape-measured height (cm). */
export const VALIDATION_HEIGHT_RANGE = { minCm: 80, maxCm: 250 } as const;

/** Anonymous codes only: letters, digits and hyphens (no spaces, so no full names or e-mail addresses). */
export const SUBJECT_ID_PATTERN = /^[A-Za-z0-9-]{2,24}$/;

export const MAX_NOTES_LENGTH = 200;
export const MAX_DEVICE_DETAILS_LENGTH = 80;

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
