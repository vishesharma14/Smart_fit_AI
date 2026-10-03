/*
 * Spoken scan guidance with the browser's built-in speech synthesis (Web
 * Speech API). Nothing is downloaded and no external service is used: the
 * voices come from the user's operating system / browser. Speech is purely
 * guidance — it never affects detection or capture.
 */

/** Parts of a voice name that usually indicate a mature male English voice, best first. */
const PREFERRED_MALE_VOICES = [
  /google uk english male/i,
  /microsoft (guy|ryan|christopher|eric|andrew|brian|davis|thomas|george|david|mark)/i,
  /\b(daniel|arthur|aaron|alex|fred|oliver|rishi|tom|lee|gordon)\b/i,
  /\bmale\b/i,
];

export interface SpeechOutput {
  /** Speaks a short sentence; replaces anything still being spoken. */
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: () => boolean;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Picks a male English voice when the system offers one, preferring voices
 * that run locally. Returns null to use the browser's default voice.
 */
export function pickGuideVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  for (const pattern of PREFERRED_MALE_VOICES) {
    const matches = english.filter((voice) => pattern.test(voice.name) && !/female/i.test(voice.name));
    if (matches.length) return matches.find((voice) => voice.localService) ?? matches[0];
  }
  return null;
}

/** Browser speech output, or null when the browser has no speech synthesis. */
export function createBrowserSpeech(): SpeechOutput | null {
  if (!isSpeechSupported()) return null;
  const synth = window.speechSynthesis;
  let voice: SpeechSynthesisVoice | null = null;
  const loadVoices = () => {
    voice = pickGuideVoice(synth.getVoices());
  };
  loadVoices();
  // Many browsers load their voice list asynchronously.
  synth.addEventListener?.('voiceschanged', loadVoices);

  return {
    speak: (text) => {
      try {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = 'en-US';
        }
        // Calm and unhurried; a slightly lower pitch reads as more mature on most voices.
        utterance.rate = 0.95;
        utterance.pitch = 0.9;
        utterance.volume = 1;
        synth.speak(utterance);
      } catch {
        // Speech is optional: never let it interrupt the scan.
      }
    },
    cancel: () => {
      try {
        synth.cancel();
      } catch {
        // Ignore.
      }
    },
    isSpeaking: () => synth.speaking || synth.pending,
  };
}
