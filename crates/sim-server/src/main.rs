//! `sim-server` — headless simulation entry point.
//!
//! Phase 0 scope: prove the `core-time` clock and the [`physiology`]
//! [`PhysiologyEngine`] trait wire together end-to-end. This binary runs a
//! fixed-step tick loop for a configurable number of ticks, prints the
//! patient's vitals at each second boundary, and exits.
//!
//! The gRPC surface (steering doc §5.1) lands in Phase 0 close once
//! ADR-0001 selects a transport library.

#![forbid(unsafe_code)]

use core_time::{Rng, Seed, SimClock, TICKS_PER_SECOND};
use physiology::{ConstantVitalsEngine, Interventions, PhysiologyEngine};
use std::process::ExitCode;

fn main() -> ExitCode {
    // Default: simulate 5 seconds of wall-clock time at 50 Hz.
    let total_ticks: u64 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(5 * TICKS_PER_SECOND);

    let seed = Seed(0xEDA5_51AD_DEAD_u64); // arbitrary, deterministic
    let _rng = Rng::from_seed(seed);

    let mut clock = SimClock::new();
    let mut engine = ConstantVitalsEngine::healthy_adult();

    println!("# tick_s\thr_bpm\tsbp\tdbp\trr\tspo2\ttemp_c");
    for _ in 0..total_ticks {
        let now = clock.advance();
        let vitals = match engine.step(now, Interventions::default()) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("sim-server: physiology step failed at tick {now:?}: {e:?}");
                return ExitCode::FAILURE;
            }
        };
        if now.0.is_multiple_of(TICKS_PER_SECOND) {
            println!(
                "{}\t{:.1}\t{:.1}\t{:.1}\t{:.1}\t{:.2}\t{:.1}",
                now.as_secs(),
                vitals.heart_rate_bpm,
                vitals.systolic_bp_mmhg,
                vitals.diastolic_bp_mmhg,
                vitals.respiratory_rate_bpm,
                vitals.spo2_fraction,
                vitals.temperature_c,
            );
        }
    }
    ExitCode::SUCCESS
}
