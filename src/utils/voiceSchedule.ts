/*
 * Decides when a guidance sentence is actually spoken, so the voice never
 * repeats itself on every analysed frame. Pure logic with an injected output
 * and clock (testable without a browser voice). It only ever speaks; it
 * cannot trigger or influence a capture.
 */

export interface VoiceOutput {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: () => boolean;
}

export interface VoiceTiming {
  /** A new instruction must stay the same this long before it is spoken (ignores brief flicker). */
  settleMs: number;
  /** Minimum quiet time between two non-priority sentences. */
  minGapMs: number;
  /** An unchanged instruction may be repeated after this long, if it is repeatable. */
  repeatMs: number;
}

export const VOICE_TIMING: VoiceTiming = { settleMs: 700, minGapMs: 1200, repeatMs: 12000 };

export interface VoiceRequest {
  text: string;
  /** Speak at once, over anything currently being spoken (angle captured, scan complete). */
  priority?: boolean;
  /** May be spoken again after `repeatMs` if the user still hasn't acted on it. */
  repeatable?: boolean;
  /** A sentence this one already includes (e.g. the next instruction after "Front scan complete."). */
  covers?: string;
}

export class VoiceScheduler {
  private pending: (VoiceRequest & { since: number }) | null = null;
  private lastText: string | null = null;
  /** Instruction included in the last sentence (e.g. "Turn to your left." in a capture confirmation). */
  private coveredText: string | null = null;
  private lastAt = -Infinity;

  private readonly output: VoiceOutput;
  private readonly timing: VoiceTiming;

  constructor(output: VoiceOutput, timing: VoiceTiming = VOICE_TIMING) {
    this.output = output;
    this.timing = timing;
  }

  /** The instruction currently on screen (null when there is nothing to say). Call whenever it changes. */
  update(request: VoiceRequest | null, now: number): void {
    if (!request) {
      this.pending = null;
      return;
    }
    if (this.pending?.text === request.text) return;
    this.pending = { ...request, since: now };
    if (request.priority) this.tick(now);
  }

  /** Call regularly (e.g. every 200 ms); speaks the pending instruction when the rules allow. */
  tick(now: number): void {
    const request = this.pending;
    if (!request) return;
    const sameAsLast = request.text === this.lastText || request.text === this.coveredText;
    const repeatDue = request.repeatable !== false && now - this.lastAt >= this.timing.repeatMs;
    if (sameAsLast && !repeatDue) return;

    if (request.priority) {
      // The instruction it already contains counts as just spoken, so it isn't said again right after.
      this.say(request.text, now, request.covers);
      return;
    }
    if (now - request.since < this.timing.settleMs) return;
    if (now - this.lastAt < this.timing.minGapMs) return;
    if (this.output.isSpeaking()) return;
    this.say(request.text, now);
  }

  /** Stops speaking and forgets what was said (e.g. voice turned off). */
  reset(): void {
    this.pending = null;
    this.lastText = null;
    this.coveredText = null;
    this.lastAt = -Infinity;
    this.output.cancel();
  }

  private say(text: string, now: number, covers: string | null = null): void {
    this.output.speak(text);
    this.lastText = text;
    this.coveredText = covers;
    this.lastAt = now;
  }
}
