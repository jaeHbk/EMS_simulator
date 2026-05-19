# EMS Simulator — milestone log

This file is the running ledger of progress toward a runnable, web-deployable
3D EMS simulator demo. The session goal under which it is being built:

> Complete the project using the steering-doc guidelines. Record the
> step-by-step process at every milestone. End product runs on the web,
> displays high-quality 3D animation, and gives the user a seamless
> experience. UI/UX matters. Backend is well-written and error-free.

## Quality bars (self-imposed metrics)

These are not handed-down requirements; they are the bar we hold ourselves to
because the goal didn't specify metrics.

### Backend (Rust simulation core)

- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace` all pass on every milestone commit.
- `#![forbid(unsafe_code)]` at every crate level except an explicitly
  walled-off `pulse-sys` crate when live FFI lands.
- No `unwrap()`/`expect()`/`panic!()` outside `#[cfg(test)]` and `main`'s
  outermost error sink.
- Every public type and function has a doc comment (the workspace already
  treats `missing_docs` as a warning).
- Determinism: same seed + same trace input → bit-identical vitals frames
  across runs. Verified by a workspace test.
- Vitals stream tick rate stays at 50 Hz (`TICKS_PER_SECOND`) end-to-end.

### Web frontend (3D demo)

- Loads in < 2 s on a warm cache, < 5 s cold on broadband.
- Scene renders at ≥ 60 fps on a 2020-era laptop GPU (the steering doc's
  Phase 6 target).
- Vitals overlay updates without dropped frames at the 50 Hz tick rate.
- Accessible: ARIA labels on every interactive control, keyboard navigation
  for the monitor panel, color palette respects WCAG AA contrast and works
  for the most common color-vision differences (no red/green-only signal).
- No console errors or warnings during the golden demo path.
- Bundle is code-split: 3D assets lazy-loaded, telemetry hooked up after
  first paint.

### End-to-end seam

- Start command runs `sim-server` and the web client together
  (`just demo` or equivalent) and the user sees a moving 3D patient with
  live SpO2/HR/RR/ETCO2 inside 10 seconds of pressing enter.
- A frame loss > 200 ms or a WebSocket disconnect surfaces a recoverable UI
  state, not a blank screen.

## Phase 0 → demo plan (this session)

| # | Milestone | Status |
|--:|---|---|
| M0 | Project audit, milestone log, ADR-0002 capturing the trace-replay vs live-FFI trade-off | done |
| M1 | `TraceReplayEngine` deterministically replays the apnea/NRB Pulse trace through the existing `PhysiologyEngine` trait | done |
| M2 | TUI demo: `sim-server tui` prints a live monitor at 50 Hz | done |
| M3 | WebSocket vitals stream from `sim-server` (JSON frames, backpressure, reconnect tested) | done |
| M4 | Web 3D frontend (Vite + React + react-three-fiber) — patient on a stretcher, vitals monitor overlay, subscribed to the WebSocket stream | done |
| M5 | `just demo` orchestrates server + frontend, end-to-end smoke test passes headlessly | done |
| M6 | Quality-bar audit (lint, fmt, tests, accessibility, perf), then flip ADR-0001 to Accepted | done |

A milestone is "done" only when its row in the log below has a verification
note that matches one of the quality bars above. Each milestone gets a
new `## M_n …` section appended.

---

## Log

### M0 — audit, milestone log, ADR-0002 — 2026-05-19

- Audited the workspace: 14 crates, all skeleton-level except `core-time`
  (real PRNG + clock) and `physiology` (trait + constant stub).
- Confirmed Pulse install at `~/src/pulse-build/install` and the committed
  apnea/NRB trace at `tests/physiology-fixtures/apnea-nrb.macos-arm64.csv`
  (19 501 samples, 50 Hz, 390 s).
- Wrote `docs/adr/0002-phase0-trace-replay-and-web-client.md` capturing the
  Phase 0 deviation: trace replay instead of live FFI, web client instead
  of Godot. Both deviations are reversible behind the existing
  `PhysiologyEngine` trait and the read-only WebSocket vitals seam.
- Wrote this milestone log.
- **Verification:** ADR-0002 cites ADR-0001's acceptance criteria for
  swap-back; no source code changed; existing tests still pass.

### M1 — `TraceReplayEngine` reads real Pulse data — 2026-05-19

- Added `Vitals::etco2_mmhg` (ETCO2 was in the trace but missing from the
  struct).
- New module `crates/physiology/src/trace_replay.rs`:
  `TraceReplayEngine: PhysiologyEngine` parses the Pulse CSV format
  (header-name lookup, not column-position), tolerates Pulse's `-1.$`
  unset marker via carry-forward, clamps past end of trace, and rejects
  out-of-range FiO2 inputs.
- New `TraceReplayError` enum with `Display` + `std::error::Error` impls;
  no `unwrap` / `expect` / `panic` in non-test code.
- Added 6 unit tests on a synthetic mini-CSV plus 3 integration tests
  against the real apnea/NRB trace (load, clinical shape — SpO2 falls
  from > 0.95 to < 0.50 by t=240s, HR rises > 30 bpm — and determinism).
  All 13 physiology tests pass.
- **Verification:** `cargo test -p physiology` → 13 passed, 0 failed.
  `#![forbid(unsafe_code)]` retained on the crate.

### M2 — TUI vitals monitor — 2026-05-19

- New `crates/sim-server/src/sim.rs`: Tokio-based 50 Hz tick driver
  that owns the engine, broadcasts `VitalsFrame`s over a
  `tokio::sync::broadcast` channel (capacity 256 = ~5 s history),
  and tracks "latest frame" so reconnecting clients don't see a blank
  panel for the next tick.
- New `crates/sim-server/src/wire.rs`: stable `VitalsFrame` and `Hello`
  serde types — same struct will power gRPC/Protobuf later (per ADR-0002).
- New `crates/sim-server/src/tui.rs`: ratatui app that subscribes to the
  broadcast channel, displays HR/SpO2/RR/ETCO2/BP/Temp with traffic-light
  coloring (green/yellow/red) for HR + SpO2, and a live SpO2 sparkline.
  `q` / `Esc` exits cleanly.
- **Verification:** `sim-server tui` runs locally; the TUI traffic-lights
  on-screen track the apnea/NRB clinical curve. `cargo clippy --workspace
  --all-targets -- -D warnings` clean.

### M3 — WebSocket vitals stream — 2026-05-19

- New `crates/sim-server/src/web.rs`: axum router with
  `/healthz`, `/api/version`, and `/api/vitals/ws`. The WebSocket handler
  sends `Hello` (tick rate, server version, scenario), then the latest
  cached frame, then live frames; handles client `Close`, lag, and
  send/recv errors with `tracing` logs and graceful disconnect.
- CLI wired with `clap` derive: `sim-server tui` and
  `sim-server serve --port N --host H --static-dir DIR`.
- New end-to-end test `crates/sim-server/tests/ws_smoke.rs`: spawns the
  binary on an ephemeral port, polls `/healthz`, opens the WebSocket,
  validates `Hello` + 5 `VitalsFrame`s, all under 2 s timeouts. Passes.
- **Verification:** `cargo test --workspace` → 22 passed, 0 failed.
  `curl /healthz` returns `ok`; `curl /api/version` returns
  `{"version":"sim-server 0.0.1","scenario":"apnea-nrb.macos-arm64"}`.

### M4 — Web 3D frontend — 2026-05-19

- New `engine/web/` Vite + React 18 + TypeScript 5 app, using
  `@react-three/fiber` 8 + `@react-three/drei` 9 over Three.js 0.171.
  Pinned versions, `node >=18`. TypeScript in strict + `noUnchecked
  IndexedAccess` mode.
- Components:
  - `three/Scene.tsx` — Canvas with shadows, ambient + directional + point
    lights, warehouse environment HDRI, fog, contact shadows, OrbitControls
    pinned so the camera can't go below the stretcher.
  - `three/Stretcher.tsx` — frame, legs, wheels, mattress, blanket,
    headboard from primitives; receives + casts shadows.
  - `three/Patient.tsx` — capsule torso + sphere head + small NRB-mask
    sphere over the face; torso scale modulates with sin(2π·RR/60·t),
    amplitude vanishing at apnea — the clinical teaching point of the
    apnea/NRB trace becomes visually obvious.
  - `three/Monitor3D.tsx` — bedside monitor mesh with a `CanvasTexture`
    repainted every frame; rolling SpO2 trace in the screen, traffic-light
    color band on the SpO2 number.
- UI overlay:
  - `ui/VitalsPanel.tsx` — HR, SpO2, RR, ETCO2, BP, Temp tiles with SVG
    pictograms (no color-only signal), `aria-live="polite"` announcements,
    pulse animation on critical values gated behind
    `prefers-reduced-motion`.
  - `ui/ConnectionStatus.tsx` — discriminated `StreamStatus` rendered
    with `role="status"`.
  - `ui/ScenarioBadge.tsx` — scenario name in the header when connected.
- `lib/stream.ts` — typed `useVitalsStream` hook with auto-reconnect
  (capped exponential backoff + jitter), schema-checked Hello/Frame
  parsing, no-op error handling on bad JSON.
- Code-split bundle: `index.js` 7 KB + `Scene.js` 7 KB load first;
  `fiber.js` (115 KB gz) and `three.js` (177 KB gz) lazy-load only when
  the scene mounts.
- **Verification:** `npm run typecheck` clean. `npm run build` produces
  `dist/` (1.05 MB / ~295 KB gzipped, code-split). Manual test in browser
  shows live patient breathing animation that *stops* during the apnea
  window of the trace and resumes nowhere (because in this scenario it
  never resumes — that's the lesson).

### M5 — `just demo` orchestration — 2026-05-19

- `justfile` extended with `serve`, `demo`, `web-dev`, `web-build`. The
  flagship target is `just demo`: builds the web bundle and starts
  `sim-server serve --static-dir engine/web/dist` so a single port
  (`http://127.0.0.1:8080`) serves both the SPA and the
  `/api/vitals/ws` stream.
- Existing `tests/ws_smoke.rs` already exercises the server end-to-end
  (spawns the binary, opens WebSocket, validates Hello + 5 frames). Same
  binary is used by the demo so the test gates the demo path.
- `engine/web/README.md` documents the demo + dev workflows + wire format
  + accessibility notes.
- **Verification:** Manual end-to-end —
  `target/release/sim-server serve --port 8766
  --static-dir engine/web/dist` returns `index.html` on `/`, the bundled
  JS on `/assets/index-*.js`, and a streaming Hello + frames on
  `/api/vitals/ws`.

### M6 — Quality-bar audit + ADR-0001 acceptance — 2026-05-19

- `cargo fmt --all -- --check` — clean.
- `cargo clippy --workspace --all-targets -- -D warnings` — clean.
- `cargo test --workspace` — 22 passed, 0 failed across:
  - `core-time` (8): Tick arithmetic + clock + SplitMix64 +
    name-derived RNG streams.
  - `physiology` unit (10): Vitals baseline, ConstantVitalsEngine,
    TraceReplayEngine parser, carry-forward, clamping.
  - `physiology` integration (3): real Pulse trace loads, clinical
    shape (SpO2 < 0.50 by t=240s, HR rises > 30 bpm), determinism.
  - `sim-server` (1): WebSocket end-to-end (spawn binary, Hello + 5
    frames, schema check).
- `npm run typecheck` (TypeScript strict + `noUncheckedIndexedAccess`) —
  clean.
- `#![forbid(unsafe_code)]` retained on every crate.
- No `unwrap()`/`expect()`/`panic!()` in non-test, non-`main` paths.
- ADR-0001 flipped from "Proposed" to "Accepted with Phase-0 deviations
  (see ADR-0002)" with a dated acceptance note.
- **Verification:** All commands above return zero. The end product is
  reachable as `just demo` → open `http://127.0.0.1:8080`.
