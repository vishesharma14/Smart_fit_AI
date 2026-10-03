import { useEffect, useRef, useState } from 'react';
import { createBrowserSpeech, isSpeechSupported } from '../services/speech';
import type { ScanGuidance } from '../utils/scanGuidance';
import { VoiceScheduler } from '../utils/voiceSchedule';

const TICK_MS = 200;

/**
 * Speaks the scan guidance aloud when enabled, without repeating itself:
 * an instruction is spoken once when it appears (after it settles), again
 * only if it is still unresolved after a while, and capture confirmations
 * are spoken straight away. Output only — it has no say in capture.
 */
export function useVoiceGuidance(guidance: ScanGuidance, enabled: boolean): { supported: boolean } {
  const [supported] = useState(isSpeechSupported);
  const schedulerRef = useRef<VoiceScheduler | null>(null);

  // One scheduler (and speech output) while enabled; speech stops when turned off or on leaving the page.
  useEffect(() => {
    if (!enabled || !supported) return;
    const output = createBrowserSpeech();
    if (!output) return;
    const scheduler = new VoiceScheduler(output);
    schedulerRef.current = scheduler;
    const interval = window.setInterval(() => scheduler.tick(performance.now()), TICK_MS);
    return () => {
      window.clearInterval(interval);
      scheduler.reset();
      schedulerRef.current = null;
    };
  }, [enabled, supported]);

  const { speech, speechPriority, speechRepeat, speechCovers } = guidance;
  useEffect(() => {
    schedulerRef.current?.update(
      speech
        ? { text: speech, priority: speechPriority, repeatable: speechRepeat ?? !speechPriority, covers: speechCovers }
        : null,
      performance.now(),
    );
  }, [speech, speechPriority, speechRepeat, speechCovers, enabled]);

  return { supported };
}
