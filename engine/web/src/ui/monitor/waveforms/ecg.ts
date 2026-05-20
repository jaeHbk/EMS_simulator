// Lead-II ECG synthesizer.
//
// Returns a single voltage sample at simulated time `tSec` for a heart
// rate of `hrBpm`. The waveform is a P-Q-R-S-T template built from a sum
// of Gaussians, scaled per-beat to the current RR interval. QT is
// rate-corrected with Bazett (QT = 0.40 · sqrt(RR_s)) so it shrinks at
// tachycardia and lengthens at bradycardia. ±2% beat-to-beat HRV jitter
// and ±1% amplitude noise add a touch of realism.
//
// Output range: roughly [-0.4, 1.0] in normalized units (R wave at 1.0).
// Display layer scales to pixels.

const P_OFFSET_S = -0.20;
const P_SIGMA_S = 0.04;
const P_AMP = 0.18;

const Q_OFFSET_S = -0.04;
const Q_SIGMA_S = 0.012;
const Q_AMP = -0.15;

const R_OFFSET_S = 0.0;
const R_SIGMA_S = 0.014;
const R_AMP = 1.0;

const S_OFFSET_S = 0.04;
const S_SIGMA_S = 0.012;
const S_AMP = -0.25;

// T-wave offset is rate-corrected from the R wave by Bazett's QT.
const T_SIGMA_S_BASE = 0.06;
const T_AMP = 0.35;

// Baseline-wander frequency (mains-style, harmless aesthetic).
const BASELINE_HZ = 60.0;
const BASELINE_AMP = 0.025;

/** Evaluate the ECG at sim-time `tSec` for heart rate `hrBpm`. */
export function sampleEcg(tSec: number, hrBpm: number): number {
  const hr = clamp(hrBpm, 20, 240);
  const rrSec = 60.0 / hr;
  // Phase within current beat, centered on the R wave.
  // Each beat is anchored such that the R peak sits at phase 0.
  const beatIndex = Math.floor(tSec / rrSec);
  // Tiny per-beat HRV jitter (deterministic, derived from beat index).
  const hrv = pseudoNoise(beatIndex * 7919) * 0.02;
  const beatStart = beatIndex * rrSec + hrv * rrSec;
  const phase = tSec - beatStart - rrSec * 0.5;

  // T-wave timing scales with sqrt(RR) (Bazett).
  const tOffset = 0.4 * Math.sqrt(rrSec);
  const tSigma = T_SIGMA_S_BASE * Math.sqrt(rrSec / 0.857); // normalized at 70 bpm

  let v = 0;
  v += gaussian(phase, P_OFFSET_S, P_SIGMA_S) * P_AMP;
  v += gaussian(phase, Q_OFFSET_S, Q_SIGMA_S) * Q_AMP;
  v += gaussian(phase, R_OFFSET_S, R_SIGMA_S) * R_AMP;
  v += gaussian(phase, S_OFFSET_S, S_SIGMA_S) * S_AMP;
  v += gaussian(phase, tOffset, tSigma) * T_AMP;

  // Amplitude noise (±1%) — sample-rate-independent because it uses tSec.
  const ampNoise = pseudoNoise(Math.floor(tSec * 1000)) * 0.01;
  v *= 1 + ampNoise;

  // Baseline wander.
  v += Math.sin(2 * Math.PI * BASELINE_HZ * tSec) * BASELINE_AMP;

  return v;
}

function gaussian(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

/** Deterministic pseudo-noise in [-1, 1]. Trivial integer hash; sufficient
 *  for adding visual variation without pulling in a PRNG. */
function pseudoNoise(seed: number): number {
  let x = seed | 0;
  x = ((x << 13) ^ x) | 0;
  x = (x * (x * x * 15731 + 789221) + 1376312589) | 0;
  return ((x & 0x7fffffff) / 0x7fffffff) * 2 - 1;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
