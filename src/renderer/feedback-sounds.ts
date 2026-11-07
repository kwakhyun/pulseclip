export type FeedbackSound = 'saved' | 'started' | 'stopped' | 'failed';

/**
 * Short synthesized cues confirm a hotkey while a fullscreen game hides every
 * window and Windows suppresses notifications. No audio files are bundled.
 */
const TONES: Record<FeedbackSound, Array<[frequency: number, startSeconds: number, durationSeconds: number]>> = {
  saved: [[880, 0, 0.09], [1320, 0.09, 0.13]],
  started: [[660, 0, 0.12]],
  stopped: [[660, 0, 0.08], [440, 0.1, 0.12]],
  failed: [[220, 0, 0.14], [196, 0.17, 0.2]],
};

let context: AudioContext | null = null;

export function playFeedbackSound(sound: FeedbackSound): void {
  try {
    context ??= new AudioContext({ latencyHint: 'interactive' });
    const audio = context;
    void audio.resume().catch(() => undefined);
    const now = audio.currentTime + 0.01;
    for (const [frequency, start, duration] of TONES[sound]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = sound === 'failed' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.1, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration + 0.02);
    }
  } catch {
    // Audio output can be missing (remote sessions, disabled devices); cues are optional.
  }
}
