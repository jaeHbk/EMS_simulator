# Session handoff — 2026-05-19

Last session: shipped a runnable, web-deployable Phase-0 demo. Web client +
WebSocket vitals stream + Pulse-trace replay are end-to-end live;
`http://127.0.0.1:8080` shows a live 3D patient with vitals updating at
50 Hz from the committed Pulse apnea/NRB trace. ADR-0001 is now
**Accepted with Phase-0 deviations** (documented in ADR-0002). For a
detailed step-by-step record of *how* this was built, read
[`docs/MILESTONES.md`](MILESTONES.md).

## What's done

- **Backend (Rust):**
  - `crates/physiology` — `TraceReplayEngine: PhysiologyEngine` parses
    Pulse CSVs by header name, tolerates the `-1.$` unset marker via
    carry-forward, deterministic by construction. 13 unit/integration
    tests including clinical-shape checks against the real apnea/NRB
    trace.
  - `crates/sim-server` — Tokio 50 Hz tick driver broadcasts
    `VitalsFrame`s via `tokio::sync::broadcast`. Ratatui TUI demo.
    Axum HTTP+WebSocket server (`/healthz`, `/api/version`,
    `/api/vitals/ws`, static-dir fallback). End-to-end `ws_smoke` test
    spawns the binary and validates Hello + 5 frames.
  - Workspace quality bar: `cargo fmt`, `cargo clippy -D warnings`,
    `cargo test --workspace` (22 passed) all clean.
    `#![forbid(unsafe_code)]` everywhere.
- **Web client (`engine/web/`):** Vite 6 + React 18 + TypeScript 5
  (strict + `noUncheckedIndexedAccess`) + `@react-three/fiber` 8 +
  drei 9 over Three.js 0.171. Stretcher + breathing-animated patient +
  bedside monitor with rolling SpO2 trace + accessible vitals overlay.
  Code-split bundle (~9 KB initial, ~295 KB gzipped lazy).
- **One-shot demo:** `just demo` builds the bundle and serves it from
  the same `sim-server` process. Open `http://127.0.0.1:8080`.
- **Docs:** ADR-0002, MILESTONES.md, `engine/web/README.md`. ADR-0001
  flipped to Accepted with deviations.

## What's NOT done (intentional Phase-0 deferrals)

- **Live Pulse FFI.** ADR-0001 still calls for `pulse-sys` +
  `bindgen`-generated bindings + a `PulseEngine: PhysiologyEngine`
  impl. ADR-0002 §"Acceptance criteria for swapping in live Pulse FFI"
  is the gate.
- **Cross-platform determinism check** (ADR-0001 spike step 3). Linux
  + Windows traces still TBD.
- **Godot 4 spike.** Replaced for Phase 0 by the web client; revisit
  only if a Phase 1+ requirement (VR, in-vehicle haptics) outgrows the
  web target.

## Recommended next steps, in order

The demo establishes the seam (`PhysiologyEngine` trait → broadcast
channel → JSON over WebSocket → 3D client). Next moves should *deepen*
fidelity along that seam, not widen it.

### Immediate (1–3 days each)

1. **Wire Pulse via FFI behind the same trait.**
   - New `crates/pulse-sys` (the *only* crate allowed `unsafe_code`,
     wall it off explicitly). Use `bindgen` against
     `~/src/pulse-build/install/include/pulse/pulsec_export.h` plus the
     extern "C" surface in `~/src/pulse/src/c/PulseEngineC.cpp`
     (`Allocate`, `InitializeEngine`, `AdvanceTimeStep`, `PullData`,
     `ProcessActions`, `Deallocate`, `PullEvents`).
   - Build script copies the runtime data dirs (`patients/`,
     `substances/`, `states/`, `nutrition/`, `environments/`, `ecg/`,
     `config/`) next to the binary so Pulse's relative paths resolve.
   - New `crates/physiology/src/pulse_engine.rs`:
     `PulseEngine: PhysiologyEngine`. Parity check: replay the same
     apnea/NRB scenario and assert per-tick output matches
     `apnea-nrb.macos-arm64.csv` to ≤ 1e-9. That closes ADR-0001 §Phase
     0 deliverable 1.
   - Add an `--engine pulse|trace` flag to `sim-server`; default stays
     `trace` until the parity test is green on CI.

2. **Action API end-to-end.** Right now the seam is read-only.
   - Add a `POST /api/actions` JSON endpoint and a matching
     `Interventions` field in the wire format (FiO2, NRB on/off, IV
     epinephrine bolus). Pipe it into the driver task as a
     `tokio::sync::mpsc` channel of pending actions consumed each tick.
   - Add a "Apply NRB 15 L/min" button in the web client. Wire it
     through to Pulse's `ProcessActions` JSON action surface once the
     FFI lands. The same button can stay no-op against the trace
     engine in the meantime.

3. **Cross-platform determinism check** (ADR-0001 spike step 3).
   - GitHub Actions matrix: macOS-arm64, macOS-x86_64, ubuntu-22.04,
     windows-2022. Run the apnea/NRB scenario against `PulseEngine`,
     diff against `apnea-nrb.macos-arm64.csv`, fail on > 1e-9 per
     sample.
   - This is what flips ADR-0001 §Phase 0 deliverable 3 from
     Phase-0-replay to a true full-stack determinism check.

### Near-term (1–2 weeks each)

4. **gRPC control plane.** The current WebSocket/JSON seam is fine for
   read-only vitals. Phase 1's instructor console + multiplayer crews
   need typed control RPCs.
   - Define `proto/sim_v1.proto` (Hello, VitalsFrame, ProcessAction,
     SnapshotRequest, ScenarioControl). Generate Rust via `tonic-build`
     and TypeScript via `protoc-gen-ts`.
   - Keep the JSON WebSocket as the read-only fan-out for browser
     clients; gRPC-Web is the typed surface for richer clients.

5. **Scenario authoring + selection.**
   - Schema for `data/scenarios/*.yaml` (patient demographics,
     comorbidities, pathology timeline, expected protocol). Validate
     with `serde_yaml` + a check pass that runs in CI.
   - `GET /api/scenarios` to list and `POST /api/scenarios/:id/start`
     to switch. Web client shows a scenario picker.
   - Adds the second scenario beyond apnea/NRB — start with chest-pain
     adult since the steering doc names it as the Phase-1 vertical
     slice.

6. **Protocol engine MVP.** Steering doc §3.3.
   - `crates/protocols`: parse the YAML protocol DSL, evaluate
     against live patient state each tick, emit guidance + grading +
     deviation events. Persist to a SQLite run log (steering doc §7
     Run log).
   - Surface protocol guidance in the web client (a side rail of "next
     recommended action" with the protocol citation).

7. **Replay + debrief.**
   - Persist every `VitalsFrame` + every action to the SQLite run log.
   - `GET /api/runs/:id/replay` streams the run log as a
     `VitalsFrame` sequence, decoupled from real time. Web client gets
     a timeline scrubber + 4×/8×/16× speed.
   - The 3D scene renders identically — replay is just a different
     publisher into the same broadcast channel.

### 3D / UX polish (parallelizable)

8. **Realistic patient model.** Replace the capsule patient with a
   GLTF rigged human (CC-licensed asset; license-review the chosen
   pack). Drive breathing via the rig's chest morph target instead of
   a uniform scale. Add subtle eye blink animation gated by GCS-V.

9. **Patient compartment interior.** A second scene that the camera
   can fly into — stretcher, monitor on a bracket, drug box, O2 tank,
   intubation kit. Use drei's `<Bvh>` for picking and click-to-zoom
   onto equipment.

10. **Vitals trends + alarms.**
    - 30 s / 60 s / 5 min toggleable history strips for HR, SpO2,
      RR, ETCO2 in the side panel.
    - WCAG-AA-compliant audible alarms (with a one-click silence + a
      visual indicator while silenced).
    - Screen-reader announcements for crossing critical thresholds
      (`aria-live="assertive"` only on first crossing, then back to
      polite).

### Quality + ops

11. **CI + cargo-deny.**
    - GitHub Actions: `cargo fmt --check`, `cargo clippy -D warnings`,
      `cargo test --workspace`, `cargo deny check`, `npm run
      typecheck && npm run build`. Cache the `target/` and
      `node_modules/`.
    - Add `cargo-deny.toml` with an allowlist for the new
      dependencies (axum, tokio, ratatui, tower-http, etc.) and a
      license-clean policy.

12. **Frontend tests.** `vitest` for `src/lib/*` (esp. `stream.ts`
    reconnect logic against a mocked WebSocket) and `playwright`
    headless for a single golden e2e ("connect, see vitals tile go red
    by t=240s"). Wire into the same CI workflow.

13. **Distribution.** Pin Rust toolchain via `rust-toolchain.toml`;
    pin Node via `.nvmrc`. Publish a Docker image that bundles the
    web `dist/` + the sim-server binary so the demo can be served
    behind any reverse proxy (and behind HTTPS, which the current
    WebSocket client already supports — it picks `wss://` if the page
    is loaded over HTTPS).

## Tactical tips for next session

- The Pulse FFI work is the highest-value next step. Start with
  `bindgen` against `pulsec_export.h` (the small extern-"C" surface) —
  not the C++ headers in `cdm/` and `engine/`, which need a C++ FFI
  story. The *only* unsafe is in `pulse-sys`; everything above the
  trait stays safe.
- Pulse expects `./states/StandardMale@0s.json` etc. **relative to
  cwd**. Either set cwd to `install/bin` or copy the runtime data dirs
  into `target/release/` at startup. The build script can do the copy
  once.
- The Java/Python data-pipeline build was a pain. Reference: the
  build steps that worked are encoded in the prior session's commits;
  quicker reference: `Pulse_JAVA_API=ON`, `Pulse_PYTHON_API=OFF`,
  `Pulse_GEN_DATA=OFF`, then run `genData` and `genStates` manually
  via `cmake -P run.cmake` from `install/bin/`.
- User explicitly prefers "step by step" — don't dump multi-phase
  plans, take one step, confirm, take the next.
- The `PhysiologyEngine` trait is the swap-in seam for everything in
  the immediate list. Resist the urge to refactor it; new behavior
  goes in new methods/types.

## Files of interest

- `docs/MILESTONES.md` — milestone log + quality bars.
- `docs/adr/0001-engine-and-sim-core-stack.md` — Accepted (with
  Phase-0 deviations).
- `docs/adr/0002-phase0-trace-replay-and-web-client.md` — Accepted.
- `crates/physiology/src/trace_replay.rs` — current Phase-0 engine.
- `crates/sim-server/src/{sim,wire,web,tui}.rs` — driver + transport
  + UIs.
- `engine/web/src/{App,three/*,ui/*,lib/stream}.tsx` — web client.
- `engine/web/README.md` — demo + dev workflows.
- `tests/physiology-fixtures/apnea-nrb.macos-arm64.csv` — the
  reference trace; the live Pulse engine must match this within
  1e-9 per sample to swap in.
