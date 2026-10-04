import type { PoseEngineStatus } from '../types/pose';
import type { CameraErrorKind, CameraStatus, FrameQuality, ScanSessionStatus, ScanViewId } from '../types/scan';
import type { BodyPart, PoseAssessment, PoseIssue } from './pose/poseValidation';
import type { ScanRegionDefinition } from './pose/scanRegions';
import type { FrameDecision } from './scan360/capture';
import type { Coverage } from './scan360/session';
import { VIEW_BY_ID } from './scan360/views';
import type { OutlineQuality } from './silhouette/outlineQuality';

export type GuidanceTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export interface ScanGuidance {
  tone: GuidanceTone;
  title: string;
  detail: string;
  /** 0–1 auto-capture progress, shown while a valid pose is being held. */
  progress?: number;
  /**
   * Short sentence for optional voice guidance, the same instruction as the
   * title. Absent for status messages that don't need to be spoken.
   */
  speech?: string;
  /** Speak immediately, even over the current sentence (angle captured / scan complete). */
  speechPriority?: boolean;
  /** False when repeating the sentence later would not help (e.g. "Hold still" during a hold). */
  speechRepeat?: boolean;
  /** Instruction already contained in `speech`, so it isn't spoken again straight after. */
  speechCovers?: string;
}

/** Adds the spoken form of an actionable instruction (its title as a sentence). */
const spoken = (guidance: ScanGuidance): ScanGuidance => ({ ...guidance, speech: `${guidance.title}.` });

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
  /** Whether the latest frame counted toward a view, and why not. */
  decision: FrameDecision | null;
  outline: OutlineQuality | null;
}

export interface GuidanceInput {
  cameraStatus: CameraStatus;
  cameraError: CameraErrorKind | null;
  sessionStatus: ScanSessionStatus;
  quality: FrameQuality | null;
  pose: PoseGuidanceState;
  coverage: Coverage;
  /** View captured a moment ago, for a brief confirmation. */
  justCaptured: ScanViewId | null;
  /** The scan was finished before full coverage. */
  finishedEarly: boolean;
  /** Body region being validated (the full body). */
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

/** Instruction for the first failed pose check. */
export function poseIssueGuidance(issue: PoseIssue, region: ScanRegionDefinition): ScanGuidance {
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
      return warn('Move a little farther back', `Step back until ${region.framingPhrase} fit inside the frame.`);
    case 'too-far':
      return warn('Move slightly closer', 'Step toward the camera so your body fills more of the frame.');
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
      return warn(
        issue.step ? `Move a little to your ${issue.step}` : 'Move to the centre of the frame',
        `${region.edgeLabel} are too close to the edge.`,
      );
    case 'body-hidden':
      return warn(
        `${PART_LABEL[issue.part]} ${issue.part === 'head' ? "isn't" : "aren't"} clearly visible`,
        'Make sure nothing blocks the camera and the room is well lit. Fitted clothing helps.',
      );
    case 'not-upright':
      return tip('Stand straight', 'Keep your body upright and the camera level.');
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

/** Instruction for an outline that can't be used for a capture. */
function outlineGuidance(outline: OutlineQuality | null): ScanGuidance {
  const warn = (title: string, detail: string): ScanGuidance => spoken({ tone: 'warning', title, detail });
  switch (outline?.issue) {
    case 'head-cut':
      return warn('Keep your head in the frame', 'Step back a little, or tilt the camera up.');
    case 'feet-cut':
      return warn('Keep your feet in the frame', 'Step back a little, or tilt the camera down.');
    case 'soft-edges':
      return warn('Hold still in good light', 'The outline of your body is blurred.');
    default:
      return warn(
        'Body outline unclear',
        'Stand in front of a plain background with even light, and keep your whole body visible.',
      );
  }
}

/** Turning instruction while no view is being captured. */
function turnGuidance(coverage: Coverage): ScanGuidance {
  if (coverage.cardinalsDone) {
    return spoken({ tone: 'info', title: 'Keep turning to face the camera', detail: 'Turn slowly to finish the circle.' });
  }
  if (coverage.captured.length === 1) {
    return spoken({ tone: 'info', title: 'Slowly turn left', detail: 'Keep your arms slightly away from your body. Pause when asked.' });
  }
  return spoken({ tone: 'info', title: 'Keep turning', detail: 'Turn slowly to your left. Each new angle is captured automatically.' });
}

/**
 * Chooses the single most useful message for the current moment. Messages
 * about body position, angle or outline come only from the pose landmarks and
 * segmentation detected on this device.
 */
export function deriveScanGuidance(input: GuidanceInput): ScanGuidance {
  const { cameraStatus, cameraError, sessionStatus, quality, pose, coverage, justCaptured, finishedEarly, scanRegion } = input;

  if (cameraStatus === 'idle') {
    return { tone: 'neutral', title: 'Camera is off', detail: 'Enable your camera to begin the guided 360° scan.' };
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
      title: 'Stand inside the outline',
      detail: 'Face the camera with your whole body in view, then start. You will turn slowly to your left; views are captured automatically.',
    };
  }
  if (sessionStatus === 'paused') {
    return { tone: 'neutral', title: 'Scan paused', detail: 'Resume when you are ready. Your camera is still on.' };
  }
  if (sessionStatus === 'finished') {
    const count = coverage.captured.length;
    return finishedEarly
      ? {
          tone: 'success',
          title: `Scan finished with ${count} views`,
          detail: 'Some views are missing, so some measurements may be unavailable or less certain.',
          speech: 'Scan finished.',
          speechPriority: true,
        }
      : {
          tone: 'success',
          title: '360° scan complete',
          detail: `${count} views captured from your pose and body outline on this device.`,
          speech: '360 degree scan complete.',
          speechPriority: true,
        };
  }

  // Scanning.
  if (justCaptured) {
    const next = turnGuidance(coverage);
    const captured = VIEW_BY_ID[justCaptured].capturedLabel;
    return {
      tone: 'success',
      title: `${captured} ✓`,
      detail: `Next: ${next.title.toLowerCase()}.`,
      speech: `${captured}. ${next.title}.`,
      speechPriority: true,
      speechCovers: `${next.title}.`,
    };
  }
  if (pose.status !== 'ready') {
    return { tone: 'info', title: 'Starting pose detection…', detail: 'Loading the on-device pose model.' };
  }
  if (!quality) {
    return { tone: 'info', title: 'Checking camera feed…', detail: 'Analysing lighting and movement.' };
  }
  if (quality.brightness === 'too-dark') {
    return spoken({ tone: 'warning', title: 'It is too dark', detail: 'Move to a brighter spot or turn on a light in front of you.' });
  }
  if (quality.brightness === 'too-bright') {
    return spoken({
      tone: 'warning',
      title: 'The image is too bright',
      detail: 'Avoid standing in front of a window or a bright lamp.',
    });
  }
  if (!pose.assessment || !pose.decision) {
    return { tone: 'info', title: 'Looking for you…', detail: 'Body detection is starting.' };
  }
  const frontCaptured = coverage.captured.includes('front');
  const { decision } = pose;
  switch (decision.reason) {
    case 'pose':
      return spoken(poseIssueGuidance(pose.assessment.issue!, scanRegion));
    case 'lighting':
      return spoken({ tone: 'warning', title: 'Keep the camera steady', detail: 'Place the phone or laptop on a stable surface.' });
    case 'front-first':
      return spoken({ tone: 'info', title: 'Face the camera', detail: 'The scan starts with you facing the camera.' });
    case 'angle-unclear':
      return frontCaptured
        ? spoken({ tone: 'info', title: 'Keep turning slowly', detail: "Your angle isn't clear yet." })
        : spoken({ tone: 'info', title: 'Face the camera', detail: 'Turn so your chest faces the camera.' });
    case 'between-views':
    case 'already-captured':
      return turnGuidance(coverage);
    case 'outline':
      return outlineGuidance(pose.outline);
    case 'moving':
      return {
        ...spoken({
          tone: 'info',
          title: 'Hold still',
          detail: `${VIEW_BY_ID[decision.view!].label} view detected. Keep steady for a moment.`,
        }),
        speechRepeat: false,
      };
    case null:
      return {
        tone: 'success',
        title: `Hold still — capturing ${VIEW_BY_ID[decision.view!].label.toLowerCase()}`,
        detail: 'Keep this position for a moment.',
        progress: pose.holdProgress,
        // Same sentence as "Hold still", so it is not repeated as the hold starts.
        speech: 'Hold still.',
        speechRepeat: false,
      };
  }
}
