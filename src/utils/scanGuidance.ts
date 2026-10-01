import type { BodyDetectionResult } from '../services/bodyDetection';
import type { CameraErrorKind, CameraStatus, FrameQuality, ScanSessionStatus } from '../types/scan';
import type { ScanPhaseDefinition } from './scanPhases';

export type GuidanceTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export interface ScanGuidance {
  tone: GuidanceTone;
  title: string;
  detail: string;
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

export interface GuidanceInput {
  cameraStatus: CameraStatus;
  cameraError: CameraErrorKind | null;
  sessionStatus: ScanSessionStatus;
  phase: ScanPhaseDefinition;
  quality: FrameQuality | null;
  /** Latest body detection result, or null when no engine is connected. */
  detection: BodyDetectionResult | null;
  detectionAvailable: boolean;
  anyCaptured: boolean;
}

/**
 * Chooses the single most useful message for the current moment. Messages
 * about body position, distance or angle are only produced from a real
 * detection result; without one the guidance says so instead of guessing.
 */
export function deriveScanGuidance(input: GuidanceInput): ScanGuidance {
  const { cameraStatus, cameraError, sessionStatus, phase, quality, detection, detectionAvailable } = input;

  if (cameraStatus === 'idle') {
    return { tone: 'neutral', title: 'Camera is off', detail: 'Enable your camera to begin the guided scan.' };
  }
  if (cameraStatus === 'requesting') {
    return { tone: 'info', title: 'Waiting for camera permission…', detail: 'Choose Allow in your browser prompt.' };
  }
  if (cameraStatus === 'error') {
    return { tone: 'error', ...CAMERA_ERROR_COPY[cameraError ?? 'unknown'] };
  }

  if (sessionStatus === 'ready') {
    return {
      tone: 'neutral',
      title: 'Position yourself inside the frame',
      detail: 'Stand back so your whole body fits inside the guide, from head to feet. Start the scan when you are ready.',
    };
  }
  if (sessionStatus === 'paused') {
    return { tone: 'neutral', title: 'Scan paused', detail: 'Resume when you are ready. Your camera is still on.' };
  }
  if (sessionStatus === 'finished') {
    return input.anyCaptured
      ? { tone: 'success', title: 'All angles captured', detail: 'Every angle was confirmed by the body detection engine.' }
      : {
          tone: 'info',
          title: 'Guidance preview complete',
          detail: 'You stepped through all four angles. No body detection ran, so nothing was captured and no measurements were taken.',
        };
  }

  // Scanning: real on-device frame checks first.
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
  if (quality.moving) {
    return { tone: 'info', title: 'Hold still', detail: 'Keep steady so the camera gets a clear view.' };
  }

  // Body position and angle: only from a connected detection engine.
  if (detectionAvailable && detection) {
    if (!detection.fullBodyInFrame) {
      return { tone: 'warning', title: 'Position yourself inside the frame', detail: 'Your whole body should fit inside the guide.' };
    }
    if (detection.distance === 'too-close') {
      return { tone: 'warning', title: 'Move slightly farther away', detail: 'Step back until your feet are inside the guide.' };
    }
    if (detection.distance === 'too-far') {
      return { tone: 'warning', title: 'Move slightly closer', detail: 'Step forward so your body fills more of the guide.' };
    }
    if (detection.orientation === phase.id) {
      return { tone: 'success', title: `${phase.label} view detected`, detail: 'Hold still for a moment.' };
    }
    return { tone: 'info', title: phase.instruction, detail: phase.detail };
  }

  return {
    tone: 'info',
    title: phase.instruction,
    detail: `${phase.detail} Lighting and stillness look good; position and angle are not verified.`,
  };
}
