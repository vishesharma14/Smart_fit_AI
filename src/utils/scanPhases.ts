import type { ScanPhaseId } from '../types/scan';

export interface ScanPhaseDefinition {
  id: ScanPhaseId;
  /** Short name for progress lists, e.g. "Front". */
  label: string;
  /** Headline instruction while this angle is active. */
  instruction: string;
  /** Supporting detail for the instruction. */
  detail: string;
}

/**
 * Scan angles in order: one continuous turn to the user's left, a quarter
 * turn at a time (front → turned left → back → turned right).
 */
export const SCAN_PHASES: ScanPhaseDefinition[] = [
  {
    id: 'front',
    label: 'Front',
    instruction: 'Face the camera',
    detail: 'Stand straight, arms slightly away from your body and feet hip-width apart.',
  },
  {
    id: 'left',
    label: 'Left turn',
    instruction: 'Turn to your left',
    detail: 'Make a quarter turn to your left so you stand side-on to the camera. Keep your arms relaxed.',
  },
  {
    id: 'back',
    label: 'Back',
    instruction: 'Turn your back to the camera',
    detail: 'Keep turning to your left until your back faces the camera, arms slightly away from your body.',
  },
  {
    id: 'right',
    label: 'Right turn',
    instruction: 'Turn to your right side',
    detail: 'One more quarter turn to your left, so you stand side-on facing the other way.',
  },
];
