# EMS Simulator overhaul — apnea game

Status: design (proposed)
Date: 2026-05-22
Scope: product B — UI overhaul + "achieve something" game loop. Agent
infrastructure (A), codebase audit (C), and full eval harness (D) are
deferred to follow-up cycles.

## 1. Goal

Ship a runnable, accurate, game-like EMS demo around a single clinical
scenario (apnea / hypoxic respiratory failure). The player applies
interventions in real time; vitals respond through a real (if shallow)
physiology model; the game ends in a clear win or loss with a scorecard.

The codebase shrinks materially in the same pass: 10 empty Rust crates
deleted, unused frontend components and chrome removed.

Out of scope for this design: agent infrastructure (CLAUDE.md /
AGENTS.md / SKILLS.md / `.claude/`), multi-scenario eval harness, Pulse
FFI integration, mobile.

## 2. Player experience

The player drops into the back of an ambulance. Camera frames the
patient on a stretcher with the bedside monitor visible. A short
briefing card explains the patient context. After 5 s the run begins:
the patient is apneic, SpO₂ falls. The player has four intervention
buttons (NRB, BVM, Suction, Position). The HUD shows the objective
("Get SpO₂ ≥ 95% and hold for 60 s"), a run clock, and a real-time
status pill (DETERIORATING / RECOVERING / STABLE). Win when SpO₂ holds
≥ 95% for 60 s. Lose when SpO₂ drops < 70% for 30 s, or when the player
applies a clinically wrong treatment (NRB on an apneic patient sustained
≥ 10 s without concurrent BVM — see §5 for the precise rule). The 10 s
grace lets the player notice the missing chest rise and switch.
End-of-run scorecard shows time-to-stable, error count, and the
intervention timeline.

Run length is 2-4 minutes start to outcome. Restart resets to the
briefing.

## 3. Architecture

Single Rust binary, three layers; thin TS frontend.

```
sim-server (Rust)
├── physiology   ─ lightweight respiratory + cardiovascular model
├── scenario     ─ apnea script + win/lose evaluator + scoring
└── web (axum)   ─ POST /api/actions, POST /api/run/restart,
                   WS  /api/vitals/ws
                          ↕
frontend (React + Three.js)
├── three/       ─ existing 3D scene, trimmed
├── ui/hud/      ─ new game HUD
├── ui/monitor/  ─ existing waveforms + tiles, kept
└── lib/         ─ ws client, action poster
```

Data flow at 50 Hz: the physiology engine ticks, producing a
`VitalsFrame`. The scenario evaluator ticks against the frame plus the
recent action log, producing a `RunFrame { phase, score,
objective_progress, last_event }`. Both ride on the same WebSocket as
distinct JSON message types. Player actions go HTTP POST →
`/api/actions` → server queue → next tick reflects the effect. The
client never owns game state; it renders.

### Crate layout after trim

```
crates/
  core-time/        keep — clock + RNG
  physiology/       rewrite — replace TraceReplayEngine
  scenario/         new — replaces empty scenario-runtime
  sim-server/       trim API; add RunFrame; add `replay` subcommand
```

Deleted: `core-ecs`, `pharmacology`, `procedures`, `protocols`, `comms`,
`world`, `vehicles`, `traffic-ai`, `cad-dispatch`, `metrics` — all
empty skeletons. Cargo workspace `members` shrinks to four. Files
survive in git history; restorable if a later phase wants them.

### Frontend layout after trim

```
engine/web/src/
  three/        Scene, AmbulanceInterior, Patient, Stretcher, Monitor3D,
                lights/ — kept; equipment meshes kept but inert (no
                PickableMesh)
  ui/hud/       new: ObjectiveBar, InterventionPicker, Briefing,
                Scorecard, RunStatus
  ui/monitor/   waveforms + tiles + trends + alarms — kept
  lib/          stream.ts (extended for RunFrame); actions.ts —
                kept; demoVitals/useInterventions/useKeyboard removed
                or rewritten as small HUD-local hooks
  styles.css    ~1410 → ~700 lines
```

Deleted: `ui/instructor/`, `ui/scenario/`, `ui/settings/` (except a
small audio-mute affordance which lives in the top bar),
`three/equipment/PickableMesh.tsx`, `lib/demoVitals.ts` (replaced by
demo-mode running the scenario state machine locally),
`lib/useInterventions.ts`, `lib/useKeyboard.ts`.

## 4. Physiology model

Crate `physiology` is rewritten end-to-end. ~250-350 LOC. The existing
`TraceReplayEngine` and the apnea/NRB Pulse CSV fixture are deleted;
the regression net moves to integration tests against the new model.

### State (per patient)

Respiratory:

- `is_breathing: bool` — set by scenario (apnea pathology forces
  false). Player cannot directly flip this; BVM provides assisted
  ventilation that substitutes.
- `tidal_volume_ml: f32`, `rr_bpm: f32` — when breathing, derived from
  drive + assist. When apneic without BVM, both go to 0. When BVM
  active, RR comes from the `breaths_per_min` parameter; tidal volume
  comes from a fixed assisted-tidal value (~500 ml) modulated by
  airway position.
- `fio2: f32` — ambient = 0.21. NRB applied = 0.85. BVM at 15 L/min
  with reservoir = 0.95.
- `minute_ventilation_lpm = tidal_volume_ml × rr_bpm / 1000`.

Gas exchange:

- `pao2_mmhg: f32` evolves toward a target with first-order time
  constant τ ≈ 30 s. Target:
  ```
  pao2_target = 700 × fio2
              − k_shunt × shunt_fraction
              − k_hypovent × max(0, 5 − minute_ventilation_lpm)
  ```
  Coefficients tuned so steady-state PaO₂ at FiO₂=0.21 with normal
  ventilation lands ~95 mmHg, and apneic decay reaches PaO₂ < 40 mmHg
  (SpO₂ < 70%) within ~3 minutes.
- `spo2_fraction = sigmoid(pao2_mmhg)` — oxyhemoglobin dissociation,
  fitted to: SpO₂=90% at PaO₂≈60, =95% at 80, =98% at 100. Stored as a
  closed-form expression, not a lookup table.

Cardiovascular (intentionally shallow for v1):

- `hr_bpm`: sympathetic response to hypoxia.
  `hr = hr_baseline + k_sym × max(0, 0.92 − spo2_fraction) × 200`,
  clamped 40-180. `hr_baseline = 75` for the v1 patient.
- `bp_systolic_mmhg`, `bp_diastolic_mmhg`: hold near baseline with
  small variance; barely move in apnea. Future scenarios that need
  real BP dynamics extend the model.
- `etco2_mmhg`: proportional to minute ventilation, clamped 0-50.
  Drops to 0 in apnea; returns with BVM.

Inputs from scenario per tick:

- `pathology_apnea: bool`
- `intervention_nrb: bool`
- `intervention_bvm_breaths_per_min: Option<f32>` (server clamps 8-20)
- `intervention_position_ok: bool` (multiplier on tidal volume; an
  unpositioned apneic patient on BVM moves ~half the air)
- `intervention_suction: bool` (timed buff: 30 s of +20% tidal volume
  modeling a cleared airway)

Patient parameters (set once at scenario start, fixed for the run):

- `shunt_fraction: f32 = 0.05` (normal physiological shunt; pathologies
  in future scenarios can raise this).
- `hr_baseline: f32 = 75`.
- `bp_systolic_baseline: f32 = 118`, `bp_diastolic_baseline: f32 = 72`.
- `temperature_c: f32 = 37.0`.

### Determinism

Same seed + same input sequence → bit-identical SpO₂ trajectory.
Verified in a workspace test. RNG comes from `core-time`'s named
sub-streams.

### Tests (physiology-only — scenario-stack tests live in §9 layer 2)

- Unit: FiO₂ → SpO₂ steady state at 0.21 / 0.85 / 0.95; apnea decay
  rate (PaO₂ < 40 mmHg by t=180s); BVM recovery rate (SpO₂ ≥ 0.95
  within ~60 s of BVM start at FiO₂=0.95); sigmoid landmarks.
- Determinism: same seed → identical SpO₂ float trajectory across two
  runs.

These exercise only `crates/physiology` and don't pull in scenario,
scoring, or wire format. End-to-end stack tests are in §9 layer 2.

## 5. Scenario engine + scoring

Crate `scenario` (new). ~200 LOC. Single hardcoded scenario for v1; no
DSL yet (added when there are 2+ scenarios).

### Phase machine

```
Briefing  →  Running  →  Won
                     →  Lost
```

- **Briefing** (5 s). Server emits `RunFrame { phase: Briefing,
  briefing_text }`. Player can't act yet. Patient on screen showing
  baseline; pathology not yet active.
- **Running**. Physiology + actions tick at 50 Hz. Win/lose evaluator
  runs each tick.
- **Won / Lost**. Terminal. Server emits one final `RunFrame` with the
  scorecard. Subsequent ticks repeat the terminal frame so a late
  client still sees the result.

Restart: `POST /api/run/restart` resets to Briefing. Full reset; no
mid-run undo.

### Win / lose rules (per tick)

```
if phase == Running:
    if spo2_fraction >= 0.95:
        hold_at_or_above_95s += dt
    else:
        hold_at_or_above_95s = 0
    if hold_at_or_above_95s >= 60.0:
        → Won

    if spo2_fraction < 0.70:
        low_streak_s += dt
    else:
        low_streak_s = 0
    if low_streak_s >= 30.0:
        → Lost("hypoxic_arrest")

    if has_clinical_error("nrb_on_apneic"):
        → Lost("incorrect_treatment")
```

### Clinical-error detection

- `nrb_on_apneic`: NRB applied while `is_breathing == false`,
  sustained ≥ 10 s, and BVM not concurrently active. The 10 s grace
  lets the player notice the missing chest rise on the patient model
  and switch.
- Future error types land in the same enum; v1 ships with this one.

### Scoring

Recorded across the run, returned in the terminal `RunFrame`:

- `time_to_stable_s`: seconds from Running-start to first sustained
  `spo2_fraction >= 0.95` (the start of the eventual 60 s hold).
- `error_count`: clinical errors triggered. Each error type counts
  once.
- `interventions_log: Vec<(t_s, ActionType, Params)>`: ordered.
  Surfaces in the scorecard timeline.

### Action types

```
apply_nrb        { fio2: 0.85 }
apply_bvm        { breaths_per_min: f32 }   // server clamps 8-20
remove_nrb       {}
remove_bvm       {}
suction_airway   {}
position_airway  {}
```

Idempotency: each action carries a client-minted ULID
(`apply_*` is naturally idempotent on the server side; duplicate IDs
are dropped).

## 6. Wire format

Hello at WS connect:

```json
{ "type": "hello", "tick_rate_hz": 50, "scenario_id": "apnea-v1",
  "server_version": "sim-server 0.0.2" }
```

Two interleaved message types (client switches on `type`):

```json
{ "type": "vitals", "tick": 1234, "sim_time_s": 24.68,
  "spo2_fraction": 0.91, "heart_rate_bpm": 95,
  "respiratory_rate_bpm": 0, "etco2_mmhg": 0,
  "systolic_bp_mmhg": 118, "diastolic_bp_mmhg": 72,
  "temperature_c": 37.0, "is_breathing": false,
  "interventions": ["nrb"] }

{ "type": "run", "tick": 1234, "phase": "running",
  "elapsed_s": 24.68,
  "objective": { "spo2_target": 0.95, "hold_seconds_required": 60,
                 "hold_remaining_s": 60 },
  "score": { "time_to_stable_s": null, "error_count": 0 },
  "last_event": { "kind": "action_applied",
                  "action_type": "apply_nrb", "t_s": 8.0 } }
```

Terminal `RunFrame`:

```json
{ "type": "run", "phase": "won", "elapsed_s": 92.4,
  "score": { "time_to_stable_s": 32.4, "error_count": 0,
             "interventions_log": [
               { "t_s": 8.2, "action": "apply_bvm",
                 "params": { "breaths_per_min": 12 } } ] } }
```

Additions are additive; no existing field is renamed or repurposed.

## 7. Frontend HUD

Replace the slot-based shell. Existing 3D scene + monitor kept; chrome
around them rebuilt as a game HUD.

Layout (≥ 1280px):

- Top bar (`ui/hud/ObjectiveBar.tsx`, new): run clock (mm:ss),
  scenario name, objective line, status pill (BRIEFING /
  DETERIORATING / RECOVERING / STABLE — color paired with text and
  shape), hold-progress meter (`X/60s`).
- Left rail (`ui/hud/InterventionPicker.tsx`, new): 4 tiles — NRB,
  BVM, Suction, Position. Hotkeys N/B/S/P, registered through a single
  `ui/hud/useHudHotkeys.ts` hook (one document-level keydown listener
  scoped to the HUD lifecycle, replaces the deleted `lib/useKeyboard
  .ts`). Each tile shows name, hover description, glowing border when
  active, and "applied at 0:08" timestamp on activation. Disabled when
  N/A. A 5th compact Restart button.
- Center: existing `three/Scene.tsx`, lightly modified. Camera
  re-framed for HUD overlays. **OrbitControls retained** (drag to
  orbit, scroll to zoom) with current bounds. Equipment meshes stay
  on the bench but are no longer pickable; HUD is the only input
  path.
- Right rail (`ui/monitor/MonitorShell.tsx`, kept): waveforms (ECG,
  Pleth, CO₂), 6 numeric tiles, trend window picker, VitalsAnnouncer
  for screen readers.

Briefing card (`ui/hud/Briefing.tsx`, new): modal at run start. 2-3
sentences of patient context, "Begin" button. Auto-advances after
5 s.

Scorecard (`ui/hud/Scorecard.tsx`, new): modal at end. Won/Lost,
time-to-stable, error count, intervention timeline as a strip,
Restart button.

### Demo mode (frontend-only)

Concept stays; implementation replaces. If WS unreachable for 3 s, the
client runs a tiny TS approximation of the scenario state machine with
a simplified physiology curve. The existing `lib/demoVitals.ts` is
deleted; its replacement (~80 LOC, in `lib/demoMode.ts`) is built around
the new RunFrame/VitalsFrame shapes. Dev-only; ground truth is the
server.

### Accessibility

Carried forward without regression:

- HUD buttons are real `<button>`s with hotkeys (single letters,
  matching existing convention).
- Status pill paired with text and shape, never color alone.
- `prefers-reduced-motion` continues to gate flashes (existing).
- Skip-link kept.
- Forced-colors block kept.
- Contrast tokens kept (`--fg-mute`, `--alarm`, `--alarm-bg` already
  AA).

## 8. Sim-server changes

Existing endpoints kept where useful:

- `GET /healthz` — kept.
- `GET /api/version` — kept; bumps to 0.0.2.
- `WS  /api/vitals/ws` — kept; carries both `vitals` and `run`
  messages.
- `POST /api/actions` — kept; action set updated to the v1 list.
- `POST /api/run/restart` — new (or extend any existing stub). Resets
  scenario to Briefing.

Removed:

- `GET /api/scenarios` — single scenario; route deleted.
- The `/api/run/pause`, `/api/run/resume`, `/api/run/rate` placeholders
  are not added (out of scope; instructor drawer is gone).

New `replay` subcommand on the binary:

```
sim-server replay tests/scenario_runs/apnea_bvm_correct_wins.json
```

Reads a recorded action sequence (`[{t_s, action, params}]`), runs the
scenario headlessly to terminal phase, exits 0 iff the recorded
expected outcome matches. Used by `just verify` to confirm the
end-to-end seam.

## 9. Testing strategy

Three layers; all run in CI; collectively answer "did this
implementation reach the milestone correctly" for this scope.

**Layer 1 — unit tests** (Rust + TS):

- `physiology` subsystem tests (FiO₂→SpO₂ at three FiO₂ levels, apnea
  decay shape, BVM recovery rate, sigmoid landmarks).
- `scenario` state machine, win/lose conditions, error detection
  timing.
- `sim-server` `ws_smoke` extended: assert RunFrame on connect, assert
  action POST round-trip reflects in next RunFrame within 1 s.
- Frontend `vitest`: HUD components render given a fake RunFrame;
  hotkeys post the right action; scorecard shows correct fields.

**Layer 2 — scenario integration tests** (Rust). New
`crates/scenario/tests/runs/`:

- `apnea_no_action_loses.rs` — do nothing → Lost("hypoxic_arrest")
  by ~t=180s.
- `apnea_nrb_only_loses.rs` — NRB without BVM → Lost("incorrect_
  treatment") by ~t=20s.
- `apnea_bvm_correct_wins.rs` — BVM at t=10s → Won by ~t=90s.
- `apnea_late_bvm_recovers.rs` — BVM at t=60s → recovers but slower.
- `apnea_position_then_bvm.rs` — Position + BVM → fastest recovery.

Headless; deterministic; under 5 s wall time total.

**Layer 3 — end-to-end smoke**: existing `ws_smoke` extended (above).
Plus the `replay` subcommand exercised by `just verify`.

### Milestone-check command

```sh
just verify
# = cargo fmt --check
#   cargo clippy --workspace --all-targets -- -D warnings
#   cargo test --workspace
#   (cd engine/web && npm run typecheck && npx vitest run)
#   cargo run -p sim-server -- replay \
#       crates/scenario/tests/runs/apnea_bvm_correct_wins.json
```

Exit 0 = all four layers green = milestone reached.

A broader multi-scenario eval harness with scoring rubrics and
regression tracking is deferred to a later cycle.

## 10. Quality bars

- `cargo fmt --check` + `clippy --workspace --all-targets -D warnings`
  + `cargo test --workspace` clean.
- `tsc -b` (strict + `noUncheckedIndexedAccess`) + `vitest run` clean.
- `vite build` initial JS ≤ 20 KB gz (current ~13 KB; HUD additions
  must not blow the budget).
- New `physiology` and `scenario` crates: `#![forbid(unsafe_code)]`;
  no `unwrap`/`expect`/`panic` outside `#[cfg(test)]`/`main`.
- All 5 scenario integration tests pass.
- `just demo` opens to a working game in a real browser. Visual-
  verified, not just typecheck-verified — the previous session never
  did this and that's part of why the demo "doesn't achieve
  anything".
- WCAG AA contrast carried forward; all existing a11y infrastructure
  preserved.
- Determinism: scenario integration tests run twice in CI with
  identical seeds; floats must match bit-for-bit.

## 11. Risks and mitigations

- **Hand-tuned physiology** is "clinically believable", not Pulse-
  grade. Integration tests pin trajectory shapes against accepted
  clinical landmarks. When Pulse FFI lands later, the trait stays the
  same; we swap the implementation; the tests catch regressions.
- **Single scenario = single point of content failure.** Model is
  scoped to be scenario-extensible (initial conditions + pathology
  overlay + win/lose rules). Adding a second scenario is small.
- **Deleting 10 crates feels irreversible.** Single commit, single
  branch, reviewable. Files survive in git history.
- **Existing 3D scene was authored for the old camera/UI.** The new
  HUD overlays the scene; camera framing must compose. Visual
  verification on a real browser is a hard requirement before
  declaring the section done.
- **Wire format additions** are strictly additive. Low risk.

## 12. What we explicitly defer

- Agent infrastructure: CLAUDE.md improvements, AGENTS.md, SKILLS.md,
  `.claude/agents`, `.claude/skills`, `.claude/commands`. Own cycle.
- Multi-scenario eval harness with scoring rubric and regression
  tracking over time. Own cycle.
- Pulse FFI integration. Lands behind the same trait when ready.
- Server-side run-control RPCs (pause/resume/rate/seek). Not used by
  this game loop; restart is enough.
- Real CC0 patient GLB with morph targets. Primitive patient is
  acceptable for v1.
- Mobile / touch input. Desktop only.
- Multi-scenario picker. Single scenario for v1; picker returns when
  there are 2+.

## 13. Files touched (preview, not exhaustive)

Created:

- `crates/physiology/src/lib.rs` (rewritten), `model.rs`, `state.rs`
- `crates/scenario/src/lib.rs`, `apnea.rs`, `score.rs`, `events.rs`
- `crates/scenario/tests/runs/*.rs` (5 integration tests)
- `crates/sim-server/src/replay.rs` (new subcommand)
- `engine/web/src/ui/hud/{ObjectiveBar,InterventionPicker,Briefing,
  Scorecard,RunStatus}.tsx`

Modified:

- `Cargo.toml` (workspace members trimmed)
- `crates/sim-server/src/{web,sim,wire}.rs` (RunFrame, action set,
  restart endpoint)
- `engine/web/src/App.tsx`, `three/Scene.tsx` (HUD wired; OrbitControls
  retained), `lib/stream.ts` (RunFrame deserialization)
- `engine/web/src/styles.css` (~1410 → ~700 lines)
- `justfile` (`verify` recipe added; `demo` unchanged)
- `README.md` (rewritten to describe the game)

Deleted:

- 10 empty crates (see §3)
- `crates/physiology/src/trace_replay.rs`,
  `tests/physiology-fixtures/apnea-nrb.macos-arm64.csv`
- `engine/web/src/ui/{instructor,scenario,settings}/` (modulo small
  audio-mute moved to top bar)
- `engine/web/src/three/equipment/PickableMesh.tsx` and equipment-
  picking machinery in `EquipmentTray.tsx`
- `engine/web/src/lib/{useInterventions,useKeyboard}.ts` deleted
- `engine/web/src/lib/demoVitals.ts` deleted; replaced by
  `engine/web/src/lib/demoMode.ts` (smaller, RunFrame-aware)
- `docs/SESSION_HANDOFF.md`, `docs/SESSION_HANDOFF_2026-05-20.md`,
  `docs/UX_REFRESH_PLAN.md` → archived under `docs/archive/`

## 14. Open questions

None blocking the implementation plan. Items deliberately answered:

- Camera: OrbitControls retained.
- Strictness: clinical-error → instant-loss (with 10 s grace).
- Briefing: 5 s fixed; not skippable in v1.
- Restart: full reset, no mid-run undo.
