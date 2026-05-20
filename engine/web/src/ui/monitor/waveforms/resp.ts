// Respiration impedance synthesizer.
//
// A simple sinusoid driven by RR with an inhale/exhale asymmetry of 1:2
// (inspiration short, expiration longer — clinically standard at rest).
// Used by the optional "respiration" strip.
//
// Output range: [0, 1] where 0 is full expiration, 1 is peak inspiration.

const INHALE_FRAC = 1 / 3; // inhale takes 1/3 of the cycle, exhale 2/3

/** Evaluate the respiration trace at sim-time `tSec` for `rrBpm`. */
export function sampleResp(tSec: number, rrBpm: number): number {
  if (rrBpm <= 0.5) return 0; // apnea
  const periodSec = 60.0 / rrBpm;
  const phase = (tSec % periodSec) / periodSec; // [0, 1)
  if (phase < INHALE_FRAC) {
    // Inhale: rising half of a cosine.
    return 0.5 * (1 - Math.cos(Math.PI * (phase / INHALE_FRAC)));
  }
  // Exhale: descending half of a cosine, slower.
  const t = (phase - INHALE_FRAC) / (1 - INHALE_FRAC);
  return 0.5 * (1 + Math.cos(Math.PI * t));
}
