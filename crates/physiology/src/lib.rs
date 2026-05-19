//! Patient physiology engine — abstract interface and a stub implementation.
//!
//! Per steering doc §3.1, patient state is a composite of subsystem models
//! (cardiovascular, respiratory, neurological, metabolic, trauma overlay,
//! pharmacology). The final implementation will integrate Pulse Physiology
//! Engine via FFI (or an in-house subset) — that decision is captured in
//! [ADR-0001](../../docs/adr/0001-engine-and-sim-core-stack.md) and is *not*
//! locked in this scaffold.
//!
//! What this crate provides today:
//!
//! * [`Vitals`] — the small subset of patient state needed for the Phase 0
//!   smoke vignette ("apnea + oxygen → `SpO2` recovers").
//! * [`PhysiologyEngine`] — the trait every implementation (Pulse, in-house,
//!   mock) must satisfy.
//! * [`ConstantVitalsEngine`] — a deterministic stub that emits a fixed set
//!   of vitals every tick, used by integration tests and for wiring-up the
//!   sim-server before a real physiology engine is plugged in.
//!
//! All clinical constants in real implementations must come from `data/`
//! files with citations (steering doc §11.3), not from this code.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

use core_time::Tick;

pub mod trace_replay;
pub use trace_replay::{TraceReplayEngine, TraceReplayError};

/// Snapshot of a patient's monitorable vital signs.
///
/// This is intentionally minimal in Phase 0. Subsequent phases will replace
/// or extend this with full subsystem state per §3.1 of the steering doc
/// (cardiac output, MAP, ETCO2, GCS components, lactate, etc.).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vitals {
    /// Heart rate in beats per minute.
    pub heart_rate_bpm: f64,
    /// Systolic blood pressure in mmHg.
    pub systolic_bp_mmhg: f64,
    /// Diastolic blood pressure in mmHg.
    pub diastolic_bp_mmhg: f64,
    /// Respiratory rate in breaths per minute.
    pub respiratory_rate_bpm: f64,
    /// Peripheral oxygen saturation (fraction in `[0.0, 1.0]`).
    pub spo2_fraction: f64,
    /// End-tidal CO2 partial pressure in mmHg.
    pub etco2_mmhg: f64,
    /// Core body temperature in degrees Celsius.
    pub temperature_c: f64,
}

impl Vitals {
    /// A reference healthy-adult-at-rest vitals snapshot.
    ///
    /// **Not** a clinical constant — used only as a stub default. Real
    /// baselines belong in `data/patients/`.
    pub const HEALTHY_ADULT_REST: Self = Self {
        heart_rate_bpm: 72.0,
        systolic_bp_mmhg: 120.0,
        diastolic_bp_mmhg: 80.0,
        respiratory_rate_bpm: 14.0,
        spo2_fraction: 0.98,
        etco2_mmhg: 36.0,
        temperature_c: 37.0,
    };
}

/// Inputs applied to the physiology engine on a single tick.
///
/// In Phase 1 this will grow to include drug administrations, airway
/// adjuncts, defibrillation energy, fluid boluses, etc. For now we model
/// only inspired oxygen fraction, which is enough for the Phase 0 vignette.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Interventions {
    /// Inspired oxygen fraction in `[0.21, 1.0]`. Room air is `0.21`.
    pub fio2: Option<f64>,
}

/// Errors a physiology engine can return.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PhysiologyError {
    /// The engine refused an input that was outside a physically reasonable
    /// range (e.g., `FiO2` > 1.0).
    InvalidInput(String),
    /// The engine could not advance for an implementation-specific reason.
    EngineFailure(String),
}

/// Abstract physiology engine.
///
/// Implementations must be **deterministic**: given the same construction
/// parameters, the same sequence of `step` calls with the same
/// [`Interventions`] must produce bit-identical [`Vitals`]. This is the
/// invariant tested by the golden physiology fixtures (steering doc §12).
pub trait PhysiologyEngine {
    /// Read the current vitals without advancing time.
    fn current_vitals(&self) -> Vitals;

    /// Advance the engine by exactly one simulation tick, applying the
    /// supplied interventions.
    ///
    /// # Errors
    ///
    /// Returns [`PhysiologyError::InvalidInput`] if any field of
    /// `interventions` is outside its physically meaningful range, or
    /// [`PhysiologyError::EngineFailure`] for implementation-specific
    /// internal errors (e.g., a Pulse FFI call that did not converge).
    fn step(&mut self, now: Tick, interventions: Interventions) -> Result<Vitals, PhysiologyError>;
}

/// Trivial physiology stub that returns a constant set of vitals on every
/// tick.
///
/// This exists so that the sim-server, scenario-runtime, and protocol engine
/// can be developed and tested before a real physiology backend is
/// integrated. **Do not use it in any pathway that grades clinical
/// performance.**
#[derive(Clone, Copy, Debug)]
pub struct ConstantVitalsEngine {
    vitals: Vitals,
}

impl ConstantVitalsEngine {
    /// Construct an engine that always reports the supplied vitals.
    #[must_use]
    pub const fn new(vitals: Vitals) -> Self {
        Self { vitals }
    }

    /// Construct an engine seeded with [`Vitals::HEALTHY_ADULT_REST`].
    #[must_use]
    pub const fn healthy_adult() -> Self {
        Self::new(Vitals::HEALTHY_ADULT_REST)
    }
}

impl PhysiologyEngine for ConstantVitalsEngine {
    fn current_vitals(&self) -> Vitals {
        self.vitals
    }

    fn step(
        &mut self,
        _now: Tick,
        interventions: Interventions,
    ) -> Result<Vitals, PhysiologyError> {
        if let Some(fio2) = interventions.fio2
            && !(0.21..=1.0).contains(&fio2)
        {
            return Err(PhysiologyError::InvalidInput(format!(
                "fio2 {fio2} outside [0.21, 1.0]"
            )));
        }
        Ok(self.vitals)
    }
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "Test code: panics on unexpected failure are the desired signal."
)]
mod tests {
    use super::*;

    #[test]
    fn healthy_baseline_is_in_normal_ranges() {
        let v = Vitals::HEALTHY_ADULT_REST;
        // Sanity checks against textbook adult ranges. These are *not*
        // clinical assertions — they exist so a typo in the constant fails
        // CI loudly.
        assert!((50.0..=100.0).contains(&v.heart_rate_bpm));
        assert!((90.0..=140.0).contains(&v.systolic_bp_mmhg));
        assert!((60.0..=90.0).contains(&v.diastolic_bp_mmhg));
        assert!((10.0..=20.0).contains(&v.respiratory_rate_bpm));
        assert!((0.94..=1.0).contains(&v.spo2_fraction));
        assert!((36.0..=37.5).contains(&v.temperature_c));
    }

    #[test]
    fn constant_engine_is_idempotent_under_step() {
        let mut engine = ConstantVitalsEngine::healthy_adult();
        let v0 = engine.current_vitals();
        for i in 0..100u64 {
            let v = engine.step(Tick(i), Interventions::default()).unwrap();
            assert_eq!(v, v0);
        }
    }

    #[test]
    fn constant_engine_rejects_out_of_range_fio2() {
        let mut engine = ConstantVitalsEngine::healthy_adult();
        let err = engine
            .step(Tick(0), Interventions { fio2: Some(2.0) })
            .unwrap_err();
        assert!(matches!(err, PhysiologyError::InvalidInput(_)));
    }

    #[test]
    fn constant_engine_accepts_room_air_and_pure_oxygen() {
        let mut engine = ConstantVitalsEngine::healthy_adult();
        engine
            .step(Tick(0), Interventions { fio2: Some(0.21) })
            .unwrap();
        engine
            .step(Tick(1), Interventions { fio2: Some(1.0) })
            .unwrap();
    }
}
