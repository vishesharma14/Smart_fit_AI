/**
 * Body outline data derived from the pose model's segmentation mask.
 *
 * The mask itself (a per-pixel "is this the person" image) is only read
 * inside the frame's detection call and is never copied, stored or
 * uploaded. What is kept are these numbers: where the outline's left and
 * right edges are on each image row. Coordinates are mask pixels (the mask
 * has the video frame's aspect ratio); edges are interpolated to sub-pixel
 * precision.
 */

/** One horizontal stretch of body pixels on a row. `left` < `right`, in mask pixels. */
export interface SilhouetteRun {
  left: number;
  right: number;
}

export interface SilhouetteRow {
  /** The run containing the body's centre line (head, torso, or both legs side-on); null where that line is background (between the legs). */
  center: SilhouetteRun | null;
  /** Runs containing each leg's line (the person's left / right leg); only on rows below the hip joints. */
  leftLeg: SilhouetteRun | null;
  rightLeg: SilhouetteRun | null;
  /** 0–1 edge sharpness of the measured run on this row (1 = a hard mask edge). */
  sharpness: number;
}

/** Outline of one analysed video frame. */
export interface SilhouetteFrame {
  /** Mask size in pixels. */
  width: number;
  height: number;
  /** Top of the head (hair included) and the floor contact (lowest foot point), in mask rows; null when not found. */
  headTopY: number | null;
  floorY: number | null;
  /** Top of the gap between the legs (front / back views with the legs apart); null when not visible. */
  crotchY: number | null;
  /** The head or feet reach the edge of the frame, so the outline may be cut off there. */
  headClipped: boolean;
  floorClipped: boolean;
  /** Indexed by mask row; null outside head top … floor. */
  rows: (SilhouetteRow | null)[];
}

/** Per-row median of the outline over a capture's hold frames, plus how steady it was. */
export interface SilhouetteProfile extends SilhouetteFrame {
  /** Number of frames combined. */
  frameCount: number;
  /** Median relative frame-to-frame variation of the centre-run width (0 = perfectly steady); null when it can't be judged. */
  widthJitter: number | null;
}
