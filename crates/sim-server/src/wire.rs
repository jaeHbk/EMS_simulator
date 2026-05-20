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
#[derive(Clone, Debug, Serialize, Deserialize)]
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

    /// Action IDs the server has accepted within the recent retention
    /// window. Clients use this to confirm optimistic UI state and to
    /// reflect server-authoritative attached-equipment in late joiners.
    /// Empty vec is the common case.
    #[serde(default)]
    pub interventions: Vec<String>,

    /// Run state at the moment this frame was produced.
    pub run_state: RunState,
}

/// Run-state envelope carried on every frame so clients (instructor UI,
/// late joiners) can render the correct controls without an extra fetch.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct RunState {
    /// Whether the driver is advancing time.
    pub mode: RunMode,
    /// Time-warp factor applied by the driver. 1.0 = real time.
    /// Today the driver is fixed at 1.0; the field is reserved for the
    /// instructor-controls slice.
    pub rate_multiplier: f64,
    /// Total elapsed sim-time seconds.
    pub elapsed_s: f64,
}

/// Discrete driver state.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunMode {
    /// The driver is advancing ticks.
    Running,
    /// The driver is holding the latest frame; ticks paused.
    Paused,
    /// The driver is rewinding/restarting; clients should drop history.
    Restarting,
}

impl Default for RunState {
    fn default() -> Self {
        Self {
            mode: RunMode::Running,
            rate_multiplier: 1.0,
            elapsed_s: 0.0,
        }
    }
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

// ─── Actions ─────────────────────────────────────────────────────────────

/// Action posted to `/api/actions`. The server echoes the `action_id` back
/// in subsequent frames' `interventions` so the client can confirm
/// optimistic UI state.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionEnvelope {
    /// Client-generated ULID. Used as an idempotency key.
    pub action_id: String,
    /// Discriminator describing what the action is.
    pub action_type: String,
    /// Action-specific parameters; opaque to the transport layer.
    #[serde(default)]
    pub params: serde_json::Value,
    /// Client's monotonic timestamp in milliseconds since epoch.
    /// Optional; useful for measuring round-trip latency.
    #[serde(default)]
    pub client_ts_ms: Option<u64>,
}

/// Server's acknowledgement that an action was accepted into the queue.
/// Acceptance is *not* the same as the action affecting vitals — the trace
/// engine no-ops; only Pulse FFI (later) actually reacts.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionAccepted {
    /// Same `action_id` the client posted.
    pub action_id: String,
    /// Tick at which the action was enqueued.
    pub accepted_at_tick: u64,
}

// ─── Scenarios ───────────────────────────────────────────────────────────

/// Listing entry returned by `GET /api/scenarios`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Scenario {
    /// Stable identifier (kebab-case).
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// One of `basic`, `intermediate`, `advanced`.
    pub difficulty: String,
    /// Expected duration in seconds (informational; the trace can run longer).
    pub duration_s: f64,
    /// One-line clinical complaint.
    pub chief_complaint: String,
    /// Notable scripted events along the timeline. May be empty.
    #[serde(default)]
    pub events: Vec<ScenarioEvent>,
}

/// Scripted event exposed in the picker timeline.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScenarioEvent {
    /// Sim-time seconds at which the event occurs.
    pub at_s: f64,
    /// Short label (e.g., "apnea onset", "ROSC").
    pub label: String,
}
