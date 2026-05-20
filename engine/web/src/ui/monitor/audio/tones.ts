// Web Audio singleton + alarm tone players.
//
// Browsers require a user gesture before AudioContext can produce sound.
// We lazily create the context on the first call to `unlock()`, which is
// invoked from a click handler in the AlarmBanner (silence button or the
// "Start" interaction). Until unlocked, every play call is a no-op.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = true;

/** Returns true if an AudioContext is initialized (post-gesture). */
export function isUnlocked(): boolean {
  return ctx !== null;
}

/** Lazily create the AudioContext. Must be called from a user-gesture
 *  handler. Subsequent calls are idempotent. */
export function unlockAudio(): void {
  if (ctx) return;
  const Ctor =
    typeof window !== 'undefined' &&
    (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext);
  if (!Ctor) return;
  try {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.6;
    masterGain.connect(ctx.destination);
  } catch {
    ctx = null;
    masterGain = null;
  }
}

/** Toggle the master mute. Persists in caller-owned settings store. */
export function setMuted(next: boolean): void {
  muted = next;
  if (masterGain) {
    masterGain.gain.cancelScheduledValues(currentTime());
    masterGain.gain.linearRampToValueAtTime(
      muted ? 0 : 0.6,
      currentTime() + 0.05,
    );
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Play a high-priority alarm burst (3 short tones). */
export function playHigh(): void {
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;
  const freqs = [880, 988, 1175]; // A5, B5, D6
  for (let i = 0; i < freqs.length; i += 1) {
    scheduleBeep(freqs[i]!, now + i * 0.18, 0.12, 0.5);
  }
}

/** Play a medium-priority alarm burst (2 tones, lower pitch). */
export function playMedium(): void {
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;
  const freqs = [659, 784]; // E5, G5
  for (let i = 0; i < freqs.length; i += 1) {
    scheduleBeep(freqs[i]!, now + i * 0.22, 0.16, 0.35);
  }
}

/** SpO2 desaturation tone — pitch maps to value (Masimo convention).
 *  Higher SpO2 = higher pitch; useful as a continuous audible feedback
 *  that doesn't require looking at the screen. */
export function playSpo2(spo2Fraction: number): void {
  if (!ctx || !masterGain) return;
  const clamped = Math.min(1, Math.max(0.5, spo2Fraction));
  // ~30 Hz per percent: 100% → 1500 Hz, 90% → 1200 Hz, 80% → 900 Hz.
  const freq = 600 + (clamped - 0.5) * 1800;
  scheduleBeep(freq, ctx.currentTime, 0.08, 0.18);
}

function scheduleBeep(
  freq: number,
  when: number,
  duration: number,
  level: number,
): void {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);

  const gain = ctx.createGain();
  // Quick attack/decay envelope so beeps don't click.
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.01);
  gain.gain.linearRampToValueAtTime(level, when + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, when + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function currentTime(): number {
  return ctx ? ctx.currentTime : 0;
}
