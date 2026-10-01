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

/** Scan angles in order. Each turn is a quarter turn to the user's left. */
export const SCAN_PHASES: ScanPhaseDefinition[] = [
  {
    id: 'front',
    label: 'Front',
    instruction: 'Face the camera',
    detail: 'Stand straight with your arms slightly away from your body.',
  },
  {
    id: 'left',
    label: 'Left side',
    instruction: 'Turn to your left',
    detail: 'Show your left side to the camera and keep your arms relaxed.',
  },
  {
    id: 'back',
    label: 'Back',
    instruction: 'Back view',
    detail: 'Turn so your back faces the camera.',
  },
  {
    id: 'right',
    label: 'Right side',
    instruction: 'Turn to your right',
    detail: 'Turn once more so your right side faces the camera.',
  },
];
