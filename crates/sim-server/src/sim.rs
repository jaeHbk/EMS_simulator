//! Simulation driver: ticks the [`PhysiologyEngine`] at a fixed rate and
//! broadcasts every produced [`VitalsFrame`] to subscribers.
//!
//! The driver is a Tokio task. It is the single writer; consumers (TUI,
//! WebSocket, integration tests) all subscribe to the broadcast channel.
//! When the channel lags, slow consumers receive `RecvError::Lagged` and
//! re-sync — the simulation does not slow down.
//!
//! Actions arrive on an `mpsc` channel and are drained each tick; their
//! IDs are appended to a sliding window so the next several emitted frames
//! echo them in `interventions`, giving clients a confirmation signal even
//! after a brief reconnect.

use crate::wire::{ActionEnvelope, RunMode, RunState, VitalsFrame};
use core_time::{SimClock, TICK_DURATION_NS, TICKS_PER_SECOND, Tick};
use physiology::{Interventions, PhysiologyEngine, Vitals};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tokio::time::{MissedTickBehavior, interval};

/// Capacity of the vitals broadcast channel. At 50 Hz, a 256-frame buffer
/// is ~5 s of history, enough that briefly-stalled clients can resync
/// without losing data, but small enough to bound memory.
const CHANNEL_CAPACITY: usize = 256;

/// Capacity of the action mpsc. Actions are drained every tick (50 Hz);
/// 256 lets a burst of clicks queue without backpressure.
const ACTION_QUEUE_CAPACITY: usize = 256;

/// How long an accepted action remains in the `interventions` echo window.
/// 60 ticks at 50 Hz = 1.2 s — long enough that a reconnecting client sees
/// the echo, short enough that the field stays small on the wire.
const INTERVENTIONS_RETENTION_TICKS: u64 = 60;

/// Trait alias for a thread-safe physiology engine.
pub trait DynEngine: PhysiologyEngine + Send + 'static {}
impl<T: PhysiologyEngine + Send + 'static> DynEngine for T {}

/// Handle owned by the rest of the program: lets you subscribe to the
/// vitals stream, post actions, and read the most recent frame without
/// racing the driver.
#[derive(Clone)]
pub struct SimHandle {
    tx: broadcast::Sender<VitalsFrame>,
    actions_tx: mpsc::Sender<ActionEnvelope>,
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
        self.latest.lock().clone()
    }

    /// Scenario identifier the driver is replaying (e.g. `"apnea-nrb"`).
    #[must_use]
    pub fn scenario(&self) -> &str {
        &self.scenario
    }

    /// Submit an action to the driver. Returns the tick the driver was on
    /// when accepted; the `action_id` will appear in subsequent frames'
    /// `interventions` for the retention window.
    ///
    /// # Errors
    ///
    /// Returns the original envelope back if the driver task has exited
    /// (mpsc closed). Callers can map this to a 503/410 at the HTTP layer.
    pub async fn submit_action(&self, action: ActionEnvelope) -> Result<u64, ActionEnvelope> {
        let action_clone_for_lookup = action.clone();
        if let Err(e) = self.actions_tx.send(action).await {
            return Err(e.0);
        }
        // The "accepted_at_tick" is best-effort: the driver hasn't drained
        // the queue yet, but the latest frame's tick is a tight upper bound
        // and is what clients want for client-side reconciliation.
        let _ = action_clone_for_lookup;
        Ok(self.latest.lock().as_ref().map_or(0, |f| f.tick))
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
    let (actions_tx, actions_rx) = mpsc::channel(ACTION_QUEUE_CAPACITY);
    let latest = Arc::new(parking_lot_helper::Mutex::new(None));
    let handle = SimHandle {
        tx: tx.clone(),
        actions_tx,
        latest: latest.clone(),
        scenario: scenario.into(),
    };

    tokio::spawn(driver_task(engine, tx, actions_rx, latest, realtime));
    handle
}

/// Sliding-window record of recently accepted action IDs and the tick at
/// which they were accepted. Pruned each tick.
struct InterventionsWindow {
    entries: VecDeque<(u64, String)>,
}

impl InterventionsWindow {
    fn new() -> Self {
        Self {
            entries: VecDeque::new(),
        }
    }
    fn push(&mut self, tick: u64, action_id: String) {
        self.entries.push_back((tick, action_id));
    }
    fn prune(&mut self, current_tick: u64) {
        while let Some(&(t, _)) = self.entries.front() {
            if current_tick.saturating_sub(t) > INTERVENTIONS_RETENTION_TICKS {
                self.entries.pop_front();
            } else {
                break;
            }
        }
    }
    fn snapshot(&self) -> Vec<String> {
        self.entries.iter().map(|(_, id)| id.clone()).collect()
    }
}

async fn driver_task(
    mut engine: Box<dyn DynEngine>,
    tx: broadcast::Sender<VitalsFrame>,
    mut actions_rx: mpsc::Receiver<ActionEnvelope>,
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

    let mut window = InterventionsWindow::new();

    loop {
        if let Some(t) = ticker.as_mut() {
            t.tick().await;
        }
        let now = clock.advance();

        // Drain any actions queued since the last tick. `try_recv` is
        // non-blocking; we stop when the queue is empty or capacity-full
        // would surprise (we never wait here).
        while let Ok(action) = actions_rx.try_recv() {
            tracing::debug!(
                action_id = %action.action_id,
                action_type = %action.action_type,
                tick = now.0,
                "action accepted"
            );
            window.push(now.0, action.action_id);
            // Trace engine ignores `Interventions::default()` — Pulse FFI
            // will translate `action.action_type` + `action.params` into
            // engine inputs in a later slice.
        }
        window.prune(now.0);

        let vitals = match engine.step(now, Interventions::default()) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(?e, ?now, "physiology step failed; stopping driver");
                return;
            }
        };
        let frame = build_frame(now, vitals, window.snapshot());
        *latest.lock() = Some(frame.clone());
        // `send` errors only when there are zero receivers — that's fine,
        // the driver still tracks `latest` so future subscribers see state.
        let _ = tx.send(frame);
    }
}

fn build_frame(tick: Tick, v: Vitals, interventions: Vec<String>) -> VitalsFrame {
    #[allow(
        clippy::cast_precision_loss,
        reason = "Tick count fits in f64 mantissa for any realistic run length."
    )]
    let sim_time_s = tick.0 as f64 / TICKS_PER_SECOND as f64;
    VitalsFrame {
        tick: tick.0,
        sim_time_s,
        heart_rate_bpm: v.heart_rate_bpm,
        systolic_bp_mmhg: v.systolic_bp_mmhg,
        diastolic_bp_mmhg: v.diastolic_bp_mmhg,
        respiratory_rate_bpm: v.respiratory_rate_bpm,
        spo2_fraction: v.spo2_fraction,
        etco2_mmhg: v.etco2_mmhg,
        temperature_c: v.temperature_c,
        interventions,
        run_state: RunState {
            mode: RunMode::Running,
            rate_multiplier: 1.0,
            elapsed_s: sim_time_s,
        },
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
