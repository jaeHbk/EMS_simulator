# Session handoff — 2026-05-15

Last session: completed ADR-0001 Phase 0 spike steps 1–2 (Pulse install + apnea/NRB scenario). User wants to **get to a UI and a real demo soon**. Bias the next sessions toward something visible and runnable, not toward more scaffolding.

## What's done

- Pulse 4.3.2 (commit `e8a36497b`) is built locally at `~/src/pulse-build/install/`, with C++ runtime + Java API + JNI + generated runtime data (`patients/`, `substances/`, `states/`).
- `tests/physiology-fixtures/apnea-nrb.scenario.json` — Phase 0 spike scenario; `apnea-nrb.macos-arm64.csv` is the committed reference trace; `run-apnea-nrb.sh` reproduces it.
- Clinical sanity: SpO2 trajectory matches textbook apnea (0.97 → 0.37 over 4 min), NRB at 15 L/min has no effect on apneic patient (correct — no ventilation, no gas exchange).
- Rust workspace scaffold compiles; `cargo run --package sim-server` prints stub constant vitals.

## Deferred (don't pick these up unprompted)

- **Cross-platform determinism check** (ADR-0001 spike step 3). Needs Linux + Windows machines. Owner-decision: defer to CI later, not now.
- **Godot 4 spike**. User has not installed Godot yet. Skip for now.

## Recommended next steps, in order

The user is impatient for something visible. Each step below produces a tangible artifact a non-engineer would understand:

1. **Wire Pulse into `crates/physiology` via FFI.** Replace `ConstantVitalsEngine` with `PulseEngine` that links `libPulseC.dylib`. After this, `cargo run --package sim-server` prints *real* desat/recovery curves, not constants. This is also the actual ADR-0001 "Rust links Pulse" deliverable.
   - Pulse C API headers: `~/src/pulse-build/install/include/pulse/`
   - Dylib: `~/src/pulse-build/install/lib/libPulseC.dylib`
   - Bind via `bindgen` (preferred) or hand-rolled `extern "C"` for the small surface we need.
   - Critical: keep it `#![forbid(unsafe_code)]` at the crate level; isolate `unsafe` to a single `pulse-sys` sub-crate.

2. **Tiny TUI demo.** Once `sim-server` produces real vitals, add a simple terminal UI (e.g. `ratatui`) that shows a live monitor — HR, SpO2, ETCO2, RR, BP — updating at the 50 Hz tick rate. This is the first thing that *looks* like an EMS sim. ~half a day of work, runs anywhere.

3. **gRPC over the same simulation.** Wrap `sim-server` in a streaming gRPC service so a client process can subscribe to vitals. ADR-0001 names gRPC as the tentative transport — this is the validation. Pair it with a CLI client (`grpcurl` works fine for the demo).

4. **Godot 4 vitals monitor.** Install Godot, build a 2D scene with a single stretcher graphic and a vitals overlay, connect to the gRPC stream. This is the first "real UI" milestone and closes the ADR-0001 spike.

5. **Flip ADR-0001 from Proposed → Accepted.** Only after steps 1+3+4 succeed end-to-end, per the ADR's own acceptance criteria.

## Tactical tips for next session

- The Pulse `PulseScenarioDriver` reads scenarios from JSON — but for the FFI work you'll likely use the **action-by-action C API** (`pulse/cdm/CommonDataModel.h`, `pulse/engine/PulseEngine.h`), not scenario files. Look at `~/src/pulse-build/install/include/pulse/cdm/CommonDataModel.h` first.
- Pulse expects `./states/StandardMale@0s.json` etc. **relative to cwd**. Either set cwd to `install/bin` or copy the runtime data dirs (`patients/`, `substances/`, `states/`, `nutrition/`, `environments/`, `ecg/`, `config/`) into the Rust binary's working dir at startup.
- The Java/Python data-pipeline build was a pain (PEP 668, JNI paths, schema regeneration). If we ever blow away `~/src/pulse-build`, the build steps that worked are encoded in the commits' chronology — but quicker reference: `Pulse_JAVA_API=ON`, `Pulse_PYTHON_API=OFF`, `Pulse_GEN_DATA=OFF`, then run `genData` and `genStates` manually via `cmake -P run.cmake` from `install/bin/`. The Python venv with `requirements.txt` from the Pulse repo is needed for `genData`.
- User explicitly said "step by step" earlier — don't dump multi-phase plans, take one step, confirm, take the next.

## Files of interest

- `docs/adr/0001-engine-and-sim-core-stack.md` — full ADR with spike acceptance criteria
- `tests/physiology-fixtures/README.md` — how the spike trace was produced
- `crates/physiology/src/lib.rs` — current `ConstantVitalsEngine` stub; this is what gets replaced
- `crates/sim-server/src/main.rs` — the binary the user will run to "see something happening"
