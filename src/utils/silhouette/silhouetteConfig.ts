/**
 * Tunable settings for the body-outline (silhouette) pipeline. Kept in one
 * place so they can be adjusted after testing on real people and devices.
 */
export const SILHOUETTE_CONFIG = {
  /** Mask confidence at which a pixel counts as the person. */
  threshold: 0.5,
  /**
   * The crotch must lie within this share of the hip-joint → knee distance below the hip joints. A gap that only
   * opens lower down is between thighs or knees that touch higher up, not the crotch.
   */
  maxCrotchDepth: 0.4,
  /** Distance (px) either side of an edge used to judge its sharpness. */
  edgeProbePx: 3,
  /** Frames with an outline needed to build a capture's profile. */
  minFrames: 3,
  /** Width jitter at which steadiness counts for nothing. */
  maxWidthJitter: 0.08,

  /** Measurement levels, as fractions of the shoulder→hip-joint distance below the shoulders (front / back views). */
  chestBand: [0.22, 0.36],
  waistBand: [0.45, 0.85],
  /** Hips: from this far above the hip joints down to the crotch (or `hipFallbackBelow` below the hip joints). */
  hipAbove: 0.1,
  hipFallbackBelow: 0.3,
  /** Upper thigh, as fractions of stature below the crotch. */
  thighBand: [0.02, 0.08],
  /** Share of a band's rows that must be measurable (arms clear of the torso). */
  minBandCoverage: 0.3,
  /** Hand length beyond the wrist, as a share of the forearm, for the arm/hand clearance check. */
  handExtension: 0.6,
  /** Half-height of the band averaged for a side-view depth, as a share of stature. */
  depthBandHalf: 0.005,
} as const;

export type SilhouetteConfig = typeof SILHOUETTE_CONFIG;
