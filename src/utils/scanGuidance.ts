import type { PoseEngineStatus } from '../types/pose';
import type { CameraErrorKind, CameraStatus, FrameQuality, ScanSessionStatus } from '../types/scan';
import type { BodyPart, PoseAssessment, PoseIssue } from './pose/poseValidation';
import type { ScanRegionDefinition } from './pose/scanRegions';
import type { ScanPhaseDefinition } from './scanPhases';

export type GuidanceTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export interface ScanGuidance {
  tone: GuidanceTone;
  title: string;
  detail: string;
  /** 0–1 auto-capture progress, shown while a valid pose is being held. */
  progress?: number;
}

export const CAMERA_ERROR_COPY: Record<CameraErrorKind, { title: string; detail: string }> = {
  'permission-denied': {
    title: 'Camera access was blocked',
    detail: "Allow camera access for this site in your browser's settings, then try again.",
  },
  'not-found': {
    title: 'No camera found',
    detail: 'Connect a camera or use a device that has one, then try again.',
  },
  'in-use': {
    title: 'Camera is busy',
    detail: 'Another app or tab may be using the camera. Close it and try again.',
  },
  ended: {
    title: 'Camera disconnected',
    detail: 'The camera stopped sending video. Check the connection and try again.',
  },
  unsupported: {
    title: 'Camera not supported',
    detail: 'This browser does not support camera access. Try a recent version of Chrome, Safari, Firefox or Edge.',
  },
  'insecure-context': {
    title: 'Secure connection required',
    detail: 'Browsers only allow camera access over HTTPS. Open SizerAI using a secure (https://) address.',
  },
  unknown: {
    title: 'Camera could not start',
    detail: 'Something went wrong while starting the camera. Please try again.',
  },
};

export interface PoseGuidanceState {
  status: PoseEngineStatus;
  assessment: PoseAssessment | null;
  /** Landmarks are moving more than the stillness limit (or stillness isn't confirmed yet). */
  moving: boolean;
  holdProgress: number;
}

export interface GuidanceInput {
  cameraStatus: CameraStatus;
  cameraError: CameraErrorKind | null;
  sessionStatus: ScanSessionStatus;
  phase: ScanPhaseDefinition;
  quality: FrameQuality | null;
  pose: PoseGuidanceState;
  /** Angle captured a moment ago, for a brief confirmation. */
  justCaptured: ScanPhaseDefinition | null;
  /** Body region being scanned (from the selected clothing). */
  scanRegion: ScanRegionDefinition;
}

const PART_LABEL: Record<BodyPart, string> = {
  head: 'Your head',
  shoulders: 'Your shoulders',
  elbows: 'Your elbows',
  hips: 'Your hips',
  knees: 'Your knees',
  feet: 'Your feet',
};

function orientationGuidance(phase: ScanPhaseDefinition, detected: PoseIssue & { kind: 'wrong-orientation' }): ScanGuidance {
  const { detected: seen } = detected;
  const tip = (title: string, detail: string): ScanGuidance => ({ tone: 'info', title, detail });
  if (seen === null) return tip(phase.instruction, `The angle isn't clear yet. ${phase.detail}`);
  switch (phase.id) {
    case 'front':
      return seen === 'back'
        ? tip('Turn around to face the camera', 'Your back is facing the camera.')
        : tip('Face the camera', 'Turn so your chest faces the camera.');
    case 'left':
      if (seen === 'right') return tip('Turn the other way', "You're turned to your right. Turn to your left instead.");
      if (seen === 'back') return tip('Turn back a little', "You've turned too far. Turn back until you're side-on.");
      return tip(phase.instruction, phase.detail);
    case 'back':
      if (seen === 'left') return tip('Keep turning to your left', 'Turn another quarter turn until your back faces the camera.');
      if (seen === 'right') return tip('Turn back a little', "You've turned too far. Turn back until your back faces the camera.");
      return tip(phase.instruction, phase.detail);
    case 'right':
      if (seen === 'back') return tip('Keep turning to your left', 'One more quarter turn, so you stand side-on.');
      if (seen === 'left') return tip('Turn the other way', "You're turned to your left. Turn to your right instead.");
      return tip(phase.instruction, phase.detail);
  }
}

/** Instruction for the first failed pose check. */
export function poseIssueGuidance(issue: PoseIssue, phase: ScanPhaseDefinition, region: ScanRegionDefinition): ScanGuidance {
  const warn = (title: string, detail: string): ScanGuidance => ({ tone: 'warning', title, detail });
  const tip = (title: string, detail: string): ScanGuidance => ({ tone: 'info', title, detail });
  switch (issue.kind) {
    case 'no-person':
      return tip(
        'Step into the frame',
        `Stand where the camera can see ${region.framingPhrase}.${region.noPersonHint ? ` ${region.noPersonHint}` : ''}`,
      );
    case 'multiple-people':
      return warn('Only one person should be in view', "Ask anyone else to step out of the camera's view.");
    case 'too-close':
      return warn('Move farther away', `Step back until ${region.framingPhrase} fit inside the frame.`);
    case 'too-far':
      return warn('Move closer', 'Step toward the camera so your body fills more of the frame.');
    case 'top-out':
      return issue.canTilt
        ? warn(
            'Tilt the camera up a little',
            `There is room below your ${region.bottomPartLabel}. Aim the camera slightly higher to bring your ${region.topPartLabel} into view.`,
          )
        : warn(`Bring your ${region.topPartLabel} into view`, 'Step back a little, or tilt the camera up.');
    case 'bottom-out':
      return issue.canTilt
        ? warn(
            'Tilt the camera down a little',
            `There is room above your ${region.topPartLabel}. Aim the camera slightly lower to bring your ${region.bottomPartLabel} into view.`,
          )
        : warn(`Bring your ${region.bottomPartLabel} into view`, 'Step back a little, or tilt the camera down.');
    case 'off-centre':
      return warn('Move to the centre of the frame', `${region.edgeLabel} are too close to the edge.`);
    case 'body-hidden':
      return warn(
        `${PART_LABEL[issue.part]} ${issue.part === 'head' ? "isn't" : "aren't"} clearly visible`,
        'Make sure nothing blocks the camera and the room is well lit. Fitted clothing helps.',
      );
    case 'wrong-orientation':
      return orientationGuidance(phase, issue);
    case 'not-upright':
      return tip('Stand up straight', 'Keep your body upright and the camera level.');
    case 'arms-down':
      return tip('Move your arms slightly away from your body', 'Leave a small gap between your arms and your sides.');
    case 'arms-raised':
      return tip('Lower your arms a little', 'Keep your arms relaxed, slightly away from your sides.');
    case 'feet-together':
      return tip('Place your feet hip-width apart', 'Leave a small gap between your legs.');
    case 'feet-wide':
      return tip('Bring your feet a little closer', 'Stand with your feet about hip-width apart.');
  }
}

/**
 * Chooses the single most useful message for the current moment. Messages
 * about body position, distance or angle come only from real pose landmarks
 * detected on this device.
 */
export function deriveScanGuidance(input: GuidanceInput): ScanGuidance {
  const { cameraStatus, cameraError, sessionStatus, phase, quality, pose, justCaptured, scanRegion } = input;

  if (cameraStatus === 'idle') {
    return { tone: 'neutral', title: 'Camera is off', detail: 'Enable your camera to begin the guided scan.' };
  }
  if (cameraStatus === 'requesting') {
    return { tone: 'info', title: 'Waiting for camera permission…', detail: 'Choose Allow in your browser prompt.' };
  }
  if (cameraStatus === 'error') {
    return { tone: 'error', ...CAMERA_ERROR_COPY[cameraError ?? 'unknown'] };
  }

  if (pose.status === 'error') {
    return {
      tone: 'error',
      title: "Pose detection couldn't start",
      detail: 'This browser could not load the on-device pose model. Try again, or use a recent version of Chrome, Edge or Safari.',
    };
  }

  if (sessionStatus === 'ready') {
    return {
      tone: 'neutral',
      title: `${scanRegion.label}: position yourself`,
      detail: scanRegion.readyDetail,
    };
  }
  if (sessionStatus === 'paused') {
    return { tone: 'neutral', title: 'Scan paused', detail: 'Resume when you are ready. Your camera is still on.' };
  }
  if (sessionStatus === 'finished') {
    return {
      tone: 'success',
      title: 'All four angles captured',
      detail: 'Each angle was confirmed from your body pose on this device. Measurements are not estimated yet.',
    };
  }

  // Scanning.
  if (justCaptured) {
    return { tone: 'success', title: `${justCaptured.label} captured`, detail: `Next: ${phase.instruction.toLowerCase()}.` };
  }
  if (pose.status !== 'ready') {
    return { tone: 'info', title: 'Starting pose detection…', detail: 'Loading the on-device pose model.' };
  }
  if (!quality) {
    return { tone: 'info', title: 'Checking camera feed…', detail: 'Analysing lighting and movement.' };
  }
  if (quality.brightness === 'too-dark') {
    return { tone: 'warning', title: 'It is too dark', detail: 'Move to a brighter spot or turn on a light in front of you.' };
  }
  if (quality.brightness === 'too-bright') {
    return {
      tone: 'warning',
      title: 'The image is too bright',
      detail: 'Avoid standing in front of a window or a bright lamp.',
    };
  }
  if (!pose.assessment) {
    return { tone: 'info', title: 'Looking for you…', detail: 'Body detection is starting.' };
  }
  if (pose.assessment.issue) return poseIssueGuidance(pose.assessment.issue, phase, scanRegion);
  if (pose.moving || quality.moving) {
    return { tone: 'info', title: 'Hold still', detail: `${phase.label} view detected. Keep steady for a moment.` };
  }
  return {
    tone: 'success',
    title: `Hold still — capturing ${phase.label.toLowerCase()}`,
    detail: 'Keep this pose for a moment.',
    progress: pose.holdProgress,
  };
}
