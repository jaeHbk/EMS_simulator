// Capnogram synthesizer (end-tidal CO2 vs time).
//
// Real capnograms have four phases per breath:
//   I  — baseline (inspiration / dead-space exhale): 0 mmHg
//   II — rapid upstroke as alveolar gas reaches the sensor
//   III— alveolar plateau, slowly rising to the ETCO2 value
//   IV — vertical drop on inspiration
// Period = 60 / RR seconds; we simulate II-III-IV-I at a fixed 35/30/5/30
// percentage split that reads correctly at clinical scrub speeds.
//
// Output is in mmHg. Display layer normalizes to its own y-axis.

const PHASE_II_END = 0.35;
const PHASE_III_END = 0.65;
const PHASE_IV_END = 0.70;
const ETCO2_FLOOR = 5.0;

/** Evaluate the capno at sim-time `tSec` for `rrBpm` and `etco2Mmhg`. */
export function sampleCapno(
  tSec: number,
  rrBpm: number,
  etco2Mmhg: number,
): number {
  if (rrBpm <= 0.5) {
    // Apnea — flatline at zero. The teaching point of the apnea/NRB
    // scenario hangs on this being visibly flat.
    return 0;
  }
  const periodSec = 60.0 / rrBpm;
  const phase = (tSec % periodSec) / periodSec; // [0, 1)
  const peak = Math.max(ETCO2_FLOOR, etco2Mmhg);

  if (phase < PHASE_II_END) {
    // Phase II: steep upstroke from 0 to ~0.95·peak.
    const t = phase / PHASE_II_END;
    return 0.95 * peak * smoothstep(t);
  }
  if (phase < PHASE_III_END) {
    // Phase III: plateau, gentle rise from 0.95·peak to peak (alveolar
    // mixing — slight upward slope is normal; a flat plateau is also
    // acceptable but the slope reads more "real").
    const t = (phase - PHASE_II_END) / (PHASE_III_END - PHASE_II_END);
    return peak * (0.95 + 0.05 * t);
  }
  if (phase < PHASE_IV_END) {
    // Phase IV: vertical drop on inspiration.
    const t = (phase - PHASE_III_END) / (PHASE_IV_END - PHASE_III_END);
    return peak * (1 - t);
  }
  // Phase I: baseline.
  return 0;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
