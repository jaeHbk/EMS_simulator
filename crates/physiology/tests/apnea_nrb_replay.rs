#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "Integration test: panics on unexpected failure are the desired signal."
)]
//! End-to-end test: the committed apnea/NRB Pulse trace round-trips through
//! [`TraceReplayEngine`] and matches the textbook behavior captured in
//! `tests/physiology-fixtures/README.md`.
//!
//! The teaching point is *not* that vitals are decimal-equal to a particular
//! value — that's the bit-exact ADR-0001 determinism check, which lives in
//! the cross-platform CSV diff. Here we assert the clinical shape: `SpO2`
//! starts ~normal, stays normal during 30 s baseline, drops while apneic
//! despite NRB application, ends profoundly hypoxic.

use core_time::{TICKS_PER_SECOND, Tick};
use physiology::{Interventions, PhysiologyEngine, TraceReplayEngine};
use std::path::PathBuf;

fn fixture_path() -> PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    PathBuf::from(manifest_dir)
        .join("..")
        .join("..")
        .join("tests")
        .join("physiology-fixtures")
        .join("apnea-nrb.macos-arm64.csv")
}

#[test]
fn apnea_nrb_trace_loads() {
    let path = fixture_path();
    let engine = TraceReplayEngine::from_csv_path(&path)
        .unwrap_or_else(|e| panic!("failed to load {}: {e}", path.display()));
    // Trace runs 0..390 s at 50 Hz → 19 501 samples (incl. t=0).
    assert!(
        engine.sample_count() >= 19_500,
        "expected ≥ 19500 samples, got {}",
        engine.sample_count()
    );
}

#[test]
fn apnea_nrb_clinical_shape() {
    let mut engine = TraceReplayEngine::from_csv_path(fixture_path()).unwrap();

    let sample_at = |engine: &mut TraceReplayEngine, target_secs: u64| {
        engine.rewind();
        let target_tick = target_secs * TICKS_PER_SECOND;
        for t in 0..target_tick {
            engine.step(Tick(t), Interventions::default()).unwrap();
        }
        engine.current_vitals()
    };

    let baseline = sample_at(&mut engine, 0);
    assert!(
        baseline.spo2_fraction > 0.95,
        "baseline SpO2 should be >0.95, got {}",
        baseline.spo2_fraction
    );
    assert!((60.0..90.0).contains(&baseline.heart_rate_bpm));

    // 30 s — still pre-apnea.
    let pre_apnea = sample_at(&mut engine, 29);
    assert!(pre_apnea.spo2_fraction > 0.93);

    // 90 s — apnea has been running ~60 s, NRB just applied; SpO2 falling.
    let mid_apnea = sample_at(&mut engine, 90);
    assert!(
        mid_apnea.spo2_fraction < 0.90,
        "by 90 s SpO2 should be < 0.90, got {}",
        mid_apnea.spo2_fraction
    );

    // 240 s — profound desat, the spike's headline number (~0.37).
    let late = sample_at(&mut engine, 240);
    assert!(
        late.spo2_fraction < 0.50,
        "by 240 s SpO2 should be < 0.50, got {}",
        late.spo2_fraction
    );

    // The clinical teaching point: HR rises with hypoxia.
    assert!(
        late.heart_rate_bpm > baseline.heart_rate_bpm + 30.0,
        "late HR should rise > 30 bpm above baseline; baseline={}, late={}",
        baseline.heart_rate_bpm,
        late.heart_rate_bpm
    );
}

#[test]
fn apnea_nrb_replay_is_deterministic() {
    let mut a = TraceReplayEngine::from_csv_path(fixture_path()).unwrap();
    let mut b = TraceReplayEngine::from_csv_path(fixture_path()).unwrap();
    for t in 0..1000u64 {
        let va = a.step(Tick(t), Interventions::default()).unwrap();
        let vb = b.step(Tick(t), Interventions::default()).unwrap();
        assert_eq!(va, vb, "divergence at tick {t}");
    }
}
