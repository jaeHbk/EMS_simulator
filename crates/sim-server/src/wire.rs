//! Wire format for the vitals stream.
//!
//! Frames are serialized as JSON over WebSocket today (ADR-0002). The same
//! struct will be the source of truth when we swap to a Protobuf/gRPC seam
//! later — `serde` derives stay, plus `prost` derives can be added without
//! breaking JSON consumers.

use serde::{Deserialize, Serialize};

/// One vitals sample on the wire.
///
/// Field names are stable; clients pin to them. Add new fields as `Option`
/// or with a default to preserve forward compatibility.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct VitalsFrame {
    /// Monotonic tick number since the start of the run.
    pub tick: u64,
    /// Simulated wall-clock seconds elapsed (tick × 0.02).
    pub sim_time_s: f64,
    /// Heart rate, beats per minute.
    pub heart_rate_bpm: f64,
    /// Systolic blood pressure, mmHg.
    pub systolic_bp_mmhg: f64,
    /// Diastolic blood pressure, mmHg.
    pub diastolic_bp_mmhg: f64,
    /// Respiratory rate, breaths per minute.
    pub respiratory_rate_bpm: f64,
    /// Peripheral oxygen saturation in `[0.0, 1.0]`.
    pub spo2_fraction: f64,
    /// End-tidal CO2, mmHg.
    pub etco2_mmhg: f64,
    /// Core body temperature, °C.
    pub temperature_c: f64,
}

/// Hello message sent once when a WebSocket client connects.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Hello {
    /// Frame sent immediately after connect — tells clients the simulation
    /// rate so they can size their decoders.
    #[serde(rename = "type")]
    pub kind: HelloKind,
    /// Simulation tick rate in Hz.
    pub tick_hz: u64,
    /// Server build identifier (helps debugging cross-version mismatches).
    pub server_version: String,
    /// Active scenario name.
    pub scenario: String,
}

/// Tag used by clients to discriminate `Hello` vs. `VitalsFrame` messages.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HelloKind {
    /// Hello.
    Hello,
}
