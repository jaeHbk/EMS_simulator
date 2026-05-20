// Photoplethysmograph synthesizer.
//
// Models the pulse-oximeter trace as a skewed sinusoid with a dicrotic
// notch, locked to the heart rate, lagged ~150 ms behind the ECG R wave
// (mechanical pulse-wave-velocity delay). Amplitude scales with SpO2 —
// at low saturation the trace flattens, but never below a 60% floor so a
// visible pulse remains.
//
// Output range: [0, 1] (we keep it positive so the strip can render
// directly without a negative half-band).

const PULSE_LAG_S = 0.15;
const NOTCH_PHASE = 0.45; // fraction of cycle where the dicrotic notch sits
const NOTCH_DEPTH = 0.12;
const NOTCH_WIDTH = 0.08;
// Decay constant of the (1 - cos)·exp shape, in cycles.
const DECAY_K = 1.6;
const SPO2_AMP_FLOOR = 0.6;

/** Evaluate the pleth at sim-time `tSec` for `hrBpm` and `spo2Fraction`
 *  in [0, 1]. */
export function samplePleth(
  tSec: number,
  hrBpm: number,
  spo2Fraction: number,
): number {
  const hr = clamp(hrBpm, 20, 240);
  const rrSec = 60.0 / hr;
  const phase = ((tSec - PULSE_LAG_S) % rrSec) / rrSec; // [0, 1)
  const phaseClamped = phase < 0 ? phase + 1 : phase;

  // Skewed sinusoid: rapid upstroke (1 - cos), exponential decay.
  const upstroke = 0.5 * (1 - Math.cos(2 * Math.PI * phaseClamped));
  const decay = Math.exp(-DECAY_K * phaseClamped);
  let v = upstroke * decay;

  // Dicrotic notch — small Gaussian dip late in the cycle.
  const dPhase = phaseClamped - NOTCH_PHASE;
  v -= NOTCH_DEPTH * Math.exp(-(dPhase * dPhase) / (NOTCH_WIDTH * NOTCH_WIDTH));

  // Amplitude scales with SpO2; never collapses to flat.
  const spo2Norm = clamp(spo2Fraction, 0, 1);
  const amp = SPO2_AMP_FLOOR + (1 - SPO2_AMP_FLOOR) * spo2Norm;
  v *= amp;

  return clamp(v, 0, 1);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
