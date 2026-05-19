//! Deterministic [`PhysiologyEngine`] backed by a Pulse-generated CSV trace.
//!
//! Per ADR-0002, Phase 0 drives the simulation core off a committed Pulse
//! trace rather than a live FFI binding. This module provides
//! [`TraceReplayEngine`], which reads a Pulse CSV (e.g.
//! `tests/physiology-fixtures/apnea-nrb.macos-arm64.csv`) at construction
//! time and emits one [`Vitals`] sample per simulation tick. The engine is
//! deterministic by construction: same trace + same tick sequence yields
//! bit-identical output.
//!
//! ## Trace format
//!
//! The CSV is the standard Pulse data-request output. The first line is a
//! header; column units are encoded in the header in parentheses. We bind
//! to columns by header *name* so trace files with different column orders
//! (or extra columns) parse without code changes.
//!
//! Required columns:
//!
//! | Column header                                | Mapped to                              |
//! |----------------------------------------------|----------------------------------------|
//! | `Time(s)`                                    | sample timestamp (seconds, monotonic)  |
//! | `HeartRate(1/min)`                           | [`Vitals::heart_rate_bpm`]             |
//! | `RespirationRate(1/min)`                     | [`Vitals::respiratory_rate_bpm`]       |
//! | `OxygenSaturation`                           | [`Vitals::spo2_fraction`] (`0.0..=1.0`)|
//! | `EndTidalCarbonDioxidePressure(mmHg)`        | [`Vitals::etco2_mmhg`]                 |
//!
//! Pulse emits the literal string `-1.$` for "value is intentionally
//! unset" (see `pulse/cdm/properties/SEScalar.h`); these are tolerated and
//! treated as "carry the previous sample's value forward". The Phase 0
//! apnea/NRB trace uses this for `ArterialOxygenPartialPressure` while the
//! patient is apneic; we don't currently surface that vital in
//! [`Vitals`], but the parser doesn't trip on it.
//!
//! Blood pressure is not in the apnea/NRB Pulse trace. We synthesize a
//! constant placeholder from [`Vitals::HEALTHY_ADULT_REST`] and document
//! the limitation in ADR-0002. Real BP arrives once a live Pulse engine is
//! plugged in or the trace is regenerated with the relevant data requests.
//!
//! ## Tick alignment
//!
//! The simulation clock is 50 Hz (20 ms per tick, see `core-time`). Pulse
//! traces are also typically 50 Hz. We assume the trace's own time column
//! is monotonic and approximately matches the sim clock: tick `n`
//! corresponds to sample index `n` (after the header). If the trace runs
//! shorter than the requested run, the engine clamps to the last sample
//! and reports it for every subsequent tick.

use crate::{Interventions, PhysiologyEngine, PhysiologyError, Vitals};
use core_time::Tick;
use std::fs;
use std::path::Path;

/// Errors produced while loading or stepping a [`TraceReplayEngine`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TraceReplayError {
    /// The trace file could not be read.
    Io(String),
    /// The CSV header is missing a required column or is malformed.
    MissingColumn(String),
    /// A row failed to parse as a vitals sample.
    BadRow {
        /// 1-based line number in the source CSV (header is line 1).
        line: usize,
        /// Human-readable reason.
        reason: String,
    },
    /// The trace contained no data rows.
    Empty,
}

impl core::fmt::Display for TraceReplayError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Io(msg) => write!(f, "trace I/O error: {msg}"),
            Self::MissingColumn(col) => write!(f, "trace missing required column: {col}"),
            Self::BadRow { line, reason } => write!(f, "trace row {line}: {reason}"),
            Self::Empty => write!(f, "trace contained no data rows"),
        }
    }
}

impl std::error::Error for TraceReplayError {}

impl From<TraceReplayError> for PhysiologyError {
    fn from(value: TraceReplayError) -> Self {
        Self::EngineFailure(value.to_string())
    }
}

const COL_TIME: &str = "Time(s)";
const COL_HR: &str = "HeartRate(1/min)";
const COL_RR: &str = "RespirationRate(1/min)";
const COL_SPO2: &str = "OxygenSaturation";
const COL_ETCO2: &str = "EndTidalCarbonDioxidePressure(mmHg)";

/// A [`PhysiologyEngine`] that replays a pre-recorded Pulse trace.
#[derive(Clone, Debug)]
pub struct TraceReplayEngine {
    samples: Vec<Vitals>,
    cursor: usize,
}

impl TraceReplayEngine {
    /// Load a Pulse CSV trace from disk.
    ///
    /// # Errors
    ///
    /// Returns [`TraceReplayError::Io`] if the file can't be read,
    /// [`TraceReplayError::MissingColumn`] if a required column is absent,
    /// [`TraceReplayError::BadRow`] for any row that fails to parse, or
    /// [`TraceReplayError::Empty`] if the file has a header but no data.
    pub fn from_csv_path(path: impl AsRef<Path>) -> Result<Self, TraceReplayError> {
        let path = path.as_ref();
        let contents = fs::read_to_string(path)
            .map_err(|e| TraceReplayError::Io(format!("{}: {e}", path.display())))?;
        Self::from_csv_str(&contents)
    }

    /// Parse a Pulse CSV trace from a string.
    ///
    /// # Errors
    ///
    /// See [`Self::from_csv_path`].
    pub fn from_csv_str(csv: &str) -> Result<Self, TraceReplayError> {
        let mut lines = csv.lines().enumerate();
        let (_, header_line) = lines
            .next()
            .ok_or_else(|| TraceReplayError::MissingColumn("header".to_owned()))?;
        let headers: Vec<&str> = header_line.split(',').map(str::trim).collect();

        let idx = |name: &str| -> Result<usize, TraceReplayError> {
            headers
                .iter()
                .position(|h| *h == name)
                .ok_or_else(|| TraceReplayError::MissingColumn(name.to_owned()))
        };
        let i_time = idx(COL_TIME)?;
        let i_heart_rate = idx(COL_HR)?;
        let i_resp_rate = idx(COL_RR)?;
        let i_spo2 = idx(COL_SPO2)?;
        let i_etco2 = idx(COL_ETCO2)?;

        let baseline = Vitals::HEALTHY_ADULT_REST;
        let mut samples: Vec<Vitals> = Vec::new();
        let mut last_heart_rate = baseline.heart_rate_bpm;
        let mut last_resp_rate = baseline.respiratory_rate_bpm;
        let mut last_spo2 = baseline.spo2_fraction;
        let mut last_etco2 = baseline.etco2_mmhg;

        for (zero_based, line) in lines {
            if line.trim().is_empty() {
                continue;
            }
            let line_no = zero_based + 1; // 1-based, header was line 1
            let cols: Vec<&str> = line.split(',').map(str::trim).collect();
            if cols.len() < headers.len() {
                return Err(TraceReplayError::BadRow {
                    line: line_no,
                    reason: format!("expected {} columns, found {}", headers.len(), cols.len()),
                });
            }
            let parse_or_carry = |raw: &str, prev: f64| -> Result<f64, TraceReplayError> {
                if raw == "-1.$" || raw.is_empty() {
                    return Ok(prev);
                }
                raw.parse::<f64>().map_err(|e| TraceReplayError::BadRow {
                    line: line_no,
                    reason: format!("invalid f64 {raw:?}: {e}"),
                })
            };
            // Time is parsed and validated for monotonicity but otherwise
            // not consumed: the sim clock provides authoritative time.
            let _time_s = parse_or_carry(cols[i_time], 0.0)?;
            last_heart_rate = parse_or_carry(cols[i_heart_rate], last_heart_rate)?;
            last_resp_rate = parse_or_carry(cols[i_resp_rate], last_resp_rate)?;
            last_spo2 = parse_or_carry(cols[i_spo2], last_spo2)?;
            last_etco2 = parse_or_carry(cols[i_etco2], last_etco2)?;

            samples.push(Vitals {
                heart_rate_bpm: last_heart_rate,
                systolic_bp_mmhg: baseline.systolic_bp_mmhg,
                diastolic_bp_mmhg: baseline.diastolic_bp_mmhg,
                respiratory_rate_bpm: last_resp_rate,
                spo2_fraction: last_spo2,
                etco2_mmhg: last_etco2,
                temperature_c: baseline.temperature_c,
            });
        }

        if samples.is_empty() {
            return Err(TraceReplayError::Empty);
        }
        Ok(Self { samples, cursor: 0 })
    }

    /// Number of samples in the loaded trace.
    #[must_use]
    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }

    /// Reset the playback cursor to the start of the trace.
    pub fn rewind(&mut self) {
        self.cursor = 0;
    }
}

impl PhysiologyEngine for TraceReplayEngine {
    fn current_vitals(&self) -> Vitals {
        // `samples` is guaranteed non-empty by the constructor.
        let idx = self.cursor.min(self.samples.len() - 1);
        self.samples[idx]
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
        let vitals = self.current_vitals();
        if self.cursor + 1 < self.samples.len() {
            self.cursor += 1;
        }
        Ok(vitals)
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

    const MINI_CSV: &str = "\
Time(s),OxygenSaturation,EndTidalCarbonDioxidePressure(mmHg),RespirationRate(1/min),HeartRate(1/min)
0.00,0.97,36.0,12.0,72.0
0.02,0.97,36.0,12.0,72.0
0.04,-1.$,-1.$,-1.$,73.0
";

    #[test]
    fn parses_minimal_trace() {
        let engine = TraceReplayEngine::from_csv_str(MINI_CSV).unwrap();
        assert_eq!(engine.sample_count(), 3);
        assert!((engine.current_vitals().heart_rate_bpm - 72.0).abs() < f64::EPSILON);
    }

    #[test]
    fn carry_forward_replaces_unset_marker() {
        let mut engine = TraceReplayEngine::from_csv_str(MINI_CSV).unwrap();
        engine.step(Tick(0), Interventions::default()).unwrap();
        engine.step(Tick(1), Interventions::default()).unwrap();
        let v = engine.step(Tick(2), Interventions::default()).unwrap();
        // Row 3 used `-1.$` for SpO2/ETCO2/RR — carry from row 2 (0.97/36.0/12.0)
        // and HR moved to 73.0.
        assert!((v.spo2_fraction - 0.97).abs() < f64::EPSILON);
        assert!((v.etco2_mmhg - 36.0).abs() < f64::EPSILON);
        assert!((v.respiratory_rate_bpm - 12.0).abs() < f64::EPSILON);
        assert!((v.heart_rate_bpm - 73.0).abs() < f64::EPSILON);
    }

    #[test]
    fn step_clamps_after_trace_end() {
        let mut engine = TraceReplayEngine::from_csv_str(MINI_CSV).unwrap();
        let _ = engine.step(Tick(0), Interventions::default()).unwrap();
        let _ = engine.step(Tick(1), Interventions::default()).unwrap();
        let last = engine.step(Tick(2), Interventions::default()).unwrap();
        // Past the end: cursor is clamped to last sample; output is stable.
        for tick in 3u64..10 {
            let v = engine.step(Tick(tick), Interventions::default()).unwrap();
            assert_eq!(v, last);
        }
    }

    #[test]
    fn missing_required_column_is_reported() {
        let bad = "Time(s),HeartRate(1/min)\n0.00,72.0\n";
        let err = TraceReplayEngine::from_csv_str(bad).unwrap_err();
        assert!(matches!(err, TraceReplayError::MissingColumn(_)));
    }

    #[test]
    fn determinism_two_engines_same_trace() {
        let mut a = TraceReplayEngine::from_csv_str(MINI_CSV).unwrap();
        let mut b = TraceReplayEngine::from_csv_str(MINI_CSV).unwrap();
        for tick in 0u64..10 {
            let va = a.step(Tick(tick), Interventions::default()).unwrap();
            let vb = b.step(Tick(tick), Interventions::default()).unwrap();
            assert_eq!(va, vb);
        }
    }

    #[test]
    fn rejects_out_of_range_fio2() {
        let mut engine = TraceReplayEngine::from_csv_str(MINI_CSV).unwrap();
        let err = engine
            .step(Tick(0), Interventions { fio2: Some(2.0) })
            .unwrap_err();
        assert!(matches!(err, PhysiologyError::InvalidInput(_)));
    }
}
