//! Simulation driver: ticks the [`PhysiologyEngine`] at a fixed rate and
//! broadcasts every produced [`VitalsFrame`] to subscribers.
//!
//! The driver is a Tokio task. It is the single writer; consumers (TUI,
//! WebSocket, integration tests) all subscribe to the broadcast channel.
//! When the channel lags, slow consumers receive `RecvError::Lagged` and
//! re-sync — the simulation does not slow down.

use crate::wire::VitalsFrame;
use core_time::{SimClock, TICK_DURATION_NS, TICKS_PER_SECOND, Tick};
use physiology::{Interventions, PhysiologyEngine, Vitals};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::time::{MissedTickBehavior, interval};

/// Capacity of the vitals broadcast channel. At 50 Hz, a 256-frame buffer
/// is ~5 s of history, enough that briefly-stalled clients can resync
/// without losing data, but small enough to bound memory.
const CHANNEL_CAPACITY: usize = 256;

/// Trait alias for a thread-safe physiology engine.
pub trait DynEngine: PhysiologyEngine + Send + 'static {}
impl<T: PhysiologyEngine + Send + 'static> DynEngine for T {}

/// Handle owned by the rest of the program: lets you subscribe to the
/// vitals stream and read the most recent frame without racing the driver.
#[derive(Clone)]
pub struct SimHandle {
    tx: broadcast::Sender<VitalsFrame>,
    latest: Arc<parking_lot_helper::Mutex<Option<VitalsFrame>>>,
    scenario: Arc<str>,
}

impl SimHandle {
    /// Subscribe to vitals frames. Each subscriber is independent; messages
    /// are fanned-out by the broadcast channel.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<VitalsFrame> {
        self.tx.subscribe()
    }

    /// Most recently emitted frame, or `None` if the driver hasn't ticked
    /// yet.
    #[must_use]
    pub fn latest(&self) -> Option<VitalsFrame> {
        *self.latest.lock()
    }

    /// Scenario identifier the driver is replaying (e.g. `"apnea-nrb"`).
    #[must_use]
    pub fn scenario(&self) -> &str {
        &self.scenario
    }
}

/// Spawn the simulation driver task and return a [`SimHandle`].
///
/// The driver runs forever (or until the process exits). It ticks at
/// 50 Hz wall-clock by default; pass `realtime: false` to tick as fast as
/// possible (useful for integration tests).
pub fn spawn(
    engine: Box<dyn DynEngine>,
    scenario: impl Into<Arc<str>>,
    realtime: bool,
) -> SimHandle {
    let (tx, _rx) = broadcast::channel(CHANNEL_CAPACITY);
    let latest = Arc::new(parking_lot_helper::Mutex::new(None));
    let handle = SimHandle {
        tx: tx.clone(),
        latest: latest.clone(),
        scenario: scenario.into(),
    };

    tokio::spawn(driver_task(engine, tx, latest, realtime));
    handle
}

async fn driver_task(
    mut engine: Box<dyn DynEngine>,
    tx: broadcast::Sender<VitalsFrame>,
    latest: Arc<parking_lot_helper::Mutex<Option<VitalsFrame>>>,
    realtime: bool,
) {
    let mut clock = SimClock::new();
    let tick_dt = Duration::from_nanos(TICK_DURATION_NS);
    let mut ticker = if realtime {
        let mut t = interval(tick_dt);
        // If the driver falls behind (e.g., laptop suspended), don't try to
        // catch up — emit the next tick when ready and stay aligned with
        // wall-clock from there. Backpressure to consumers is the
        // broadcast channel's job, not the driver's.
        t.set_missed_tick_behavior(MissedTickBehavior::Delay);
        Some(t)
    } else {
        None
    };

    loop {
        if let Some(t) = ticker.as_mut() {
            t.tick().await;
        }
        let now = clock.advance();
        let vitals = match engine.step(now, Interventions::default()) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(?e, ?now, "physiology step failed; stopping driver");
                return;
            }
        };
        let frame = build_frame(now, vitals);
        *latest.lock() = Some(frame);
        // `send` errors only when there are zero receivers — that's fine,
        // the driver still tracks `latest` so future subscribers see state.
        let _ = tx.send(frame);
    }
}

fn build_frame(tick: Tick, v: Vitals) -> VitalsFrame {
    #[allow(
        clippy::cast_precision_loss,
        reason = "Tick count fits in f64 mantissa for any realistic run length."
    )]
    VitalsFrame {
        tick: tick.0,
        sim_time_s: tick.0 as f64 / TICKS_PER_SECOND as f64,
        heart_rate_bpm: v.heart_rate_bpm,
        systolic_bp_mmhg: v.systolic_bp_mmhg,
        diastolic_bp_mmhg: v.diastolic_bp_mmhg,
        respiratory_rate_bpm: v.respiratory_rate_bpm,
        spo2_fraction: v.spo2_fraction,
        etco2_mmhg: v.etco2_mmhg,
        temperature_c: v.temperature_c,
    }
}

/// Inline, lock-free-ish mutex helper so we don't pull in `parking_lot`.
/// `std::sync::Mutex` is fine here — the critical section is one pointer
/// store and there's no contention.
mod parking_lot_helper {
    use std::sync::{Mutex as StdMutex, MutexGuard, PoisonError};

    pub struct Mutex<T>(StdMutex<T>);
    impl<T> Mutex<T> {
        pub const fn new(value: T) -> Self {
            Self(StdMutex::new(value))
        }
        pub fn lock(&self) -> MutexGuard<'_, T> {
            self.0.lock().unwrap_or_else(PoisonError::into_inner)
        }
    }
}
