import type { ClothingType } from '../../types/domain';
import { LM } from './landmarks';

/*
 * Which part of the body a scan validates, decided by the selected clothing.
 * Everything region-specific lives here — framing bounds, required landmarks,
 * orientation cues, posture checks and copy — so the scan pipeline itself is
 * shared by every garment.
 */

export type ScanRegionId = 'full' | 'upper' | 'lower';

/** Body parts whose landmarks must be clearly seen. */
export type BodyPart = 'head' | 'shoulders' | 'elbows' | 'hips' | 'knees' | 'feet';

/**
 * Vertical extent of the region, from real landmarks:
 * - `head-top`: top of the head (extrapolated above the ears)
 * - `face`: eyes/ears level, so the face and neck are in view
 * - `waist`: a little above the hip joints
 * - `below-hips`: a little below the hip joints (shirt / jacket hem)
 * - `feet`: lowest of the heels, toes and ankles
 */
export type RegionTop = 'head-top' | 'face' | 'waist';
export type RegionBottom = 'below-hips' | 'feet';

export interface ScanRegionDefinition {
  id: ScanRegionId;
  /** Short name, e.g. "Upper-body scan". */
  label: string;
  /** What must stay visible, e.g. "Keep your shoulders, torso and arms visible." */
  summary: string;
  /** Front / back posture the checks expect. */
  postureHint: string;
  top: RegionTop;
  bottom: RegionBottom;
  /** Names used in framing guidance ("Bring your … into view"). */
  topPartLabel: string;
  bottomPartLabel: string;
  /** What the camera must see, e.g. "your whole body, from head to feet". */
  framingPhrase: string;
  /** Parts that can run off the sides, e.g. "Your arms or feet". */
  edgeLabel: string;
  /** Landmarks that must be clearly visible (side-on, one side of each pair is enough). */
  requiredParts: BodyPart[];
  /** Landmarks that must stay inside the left and right edges of the preview. */
  edgePoints: readonly number[];
  /**
   * Reference length used to normalise distances and judge turning: the torso
   * (shoulders to hips) when the upper body is in the region, otherwise the
   * thigh (hips to knees).
   */
  scale: 'torso' | 'thigh';
  /** Front/back posture checks that apply to this region. */
  checkArms: boolean;
  checkStance: boolean;
  /** Region height (top to bottom bound) as a share of the visible preview height. */
  minSpan: number;
  maxSpan: number;
  /** Landmarks tracked for stillness. */
  stillnessPoints: readonly number[];
  /** Instruction before the scan starts. */
  readyDetail: string;
  /** Extra help when no person is detected. */
  noPersonHint?: string;
  /** Vertical part of the reference figure to show, as fractions of its height (0 = feet, 1 = head top). */
  guideRange: [number, number];
}

const ARM_POINTS = [LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist];
const LEG_POINTS = [
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
  LM.leftHeel,
  LM.rightHeel,
  LM.leftFoot,
  LM.rightFoot,
];

export const SCAN_REGIONS: Record<ScanRegionId, ScanRegionDefinition> = {
  full: {
    id: 'full',
    label: 'Full-body scan',
    summary: 'Keep your whole body visible, from head to feet.',
    postureHint: 'Facing or with your back to the camera, hold your arms slightly away from your body and stand with your feet hip-width apart.',
    top: 'head-top',
    bottom: 'feet',
    topPartLabel: 'head',
    bottomPartLabel: 'feet',
    framingPhrase: 'your whole body, from head to feet',
    edgeLabel: 'Your arms or feet',
    requiredParts: ['head', 'shoulders', 'hips', 'knees', 'feet'],
    edgePoints: [...ARM_POINTS, ...LEG_POINTS],
    scale: 'torso',
    checkArms: true,
    checkStance: true,
    minSpan: 0.5,
    maxSpan: 0.95,
    stillnessPoints: [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
    readyDetail: 'Stand back so your whole body fits inside the guide, from head to feet. Start the scan when you are ready.',
    guideRange: [0, 1],
  },
  upper: {
    id: 'upper',
    label: 'Upper-body scan',
    summary: 'Keep your shoulders, torso and arms visible.',
    postureHint: 'Facing or with your back to the camera, hold your arms slightly away from your body. Your feet do not need to be in view.',
    top: 'face',
    bottom: 'below-hips',
    topPartLabel: 'head and neck',
    bottomPartLabel: 'waist',
    framingPhrase: 'your face, shoulders, arms and hips',
    edgeLabel: 'Your arms',
    requiredParts: ['head', 'shoulders', 'elbows', 'hips'],
    edgePoints: [...ARM_POINTS, LM.leftHip, LM.rightHip],
    scale: 'torso',
    checkArms: true,
    checkStance: false,
    minSpan: 0.33,
    maxSpan: 0.95,
    stillnessPoints: [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftHip, LM.rightHip],
    readyDetail: 'Frame yourself from your face down to just below your hips. Your feet do not need to be visible.',
    guideRange: [0.4, 1],
  },
  lower: {
    id: 'lower',
    label: 'Lower-body scan',
    summary: 'Keep your waist, hips and legs visible.',
    postureHint: 'Facing or with your back to the camera, stand with your feet hip-width apart. Your head does not need to be in view.',
    top: 'waist',
    bottom: 'feet',
    topPartLabel: 'waist',
    bottomPartLabel: 'feet',
    framingPhrase: 'your waist, legs and feet',
    edgeLabel: 'Your legs or feet',
    requiredParts: ['hips', 'knees', 'feet'],
    edgePoints: LEG_POINTS,
    scale: 'thigh',
    checkArms: false,
    checkStance: true,
    minSpan: 0.33,
    maxSpan: 0.95,
    stillnessPoints: [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
    readyDetail: 'Frame yourself from your waist down to your feet. Your head does not need to be visible.',
    // MediaPipe's person detector finds people from the head and upper body, so a frame showing only legs
    // can't be detected at all.
    noPersonHint: 'If you are not detected, step back so your upper body is in view too — detection starts from the head and shoulders.',
    guideRange: [0, 0.66],
  },
};

/** The body region each garment is scanned for. */
export const CLOTHING_SCAN_REGION: Record<ClothingType, ScanRegionId> = {
  't-shirt': 'upper',
  shirt: 'upper',
  blazer: 'upper',
  jeans: 'lower',
  trousers: 'lower',
};

/** Region for the selected clothing; a full-body scan when nothing is selected. */
export function scanRegionFor(type: ClothingType | null | undefined): ScanRegionDefinition {
  return SCAN_REGIONS[type ? CLOTHING_SCAN_REGION[type] : 'full'];
}
