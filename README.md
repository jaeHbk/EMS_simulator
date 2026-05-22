# EMS Simulator

A physiologically and operationally accurate 3D Emergency Medical Services
training simulator. Runs in the browser: a Rust simulation core ticks the
patient at 50 Hz and a React + Three.js client renders a stylized
ambulance compartment with a live clinical monitor.

The single source of truth for vision and architecture is
[`.kiro/steering/ems_simulator_agent_steering_doc.md`](.kiro/steering/ems_simulator_agent_steering_doc.md).
The two active workplans are
[`docs/UX_REFRESH_PLAN.md`](docs/UX_REFRESH_PLAN.md) (UI/UX, mostly
shipped) and [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md)
(deeper-fidelity track: Pulse FFI, gRPC, scenarios, replay).

## What the demo shows

- A stylized ambulance compartment: Stryker-style stretcher with scissor
  legs and side rails, bench seat, upper cabinets, O₂ wall outlet,
  windows, grab rail, interior LED lighting.
- A breathing patient with hospital gown, ECG lead dots, pulse oximeter,
  and cyanosis + pallor uniforms driven by live SpO₂ / MAP.
- A multi-vital **bedside monitor** in the 3D scene (HR, SpO₂, RR,
  ETCO₂, BP, Temp with ECG and pleth traces), plus a full **clinical
  monitor** in the right rail: synthesized **Lead-II ECG**, **pleth**,
  and **capnogram** waveforms; six numeric tiles with sparkline trends;
  priority-tiered alarm banner with audible tones + 2-min silence.
- **Interactive equipment panel** in the left rail — seven items (NRB
  mask, BVM, IV pole, defibrillator, drug box, O₂ tank, intubation kit)
  with click-to-apply buttons, keyboard hotkeys (N/B/I/D/G/O/T), and a
  live action log showing pending/confirmed/rejected status.
- **Run-state indicator** in the top bar (LIVE/PAUSED pill with rate
  multiplier), scenario picker, and settings dialog (audio mute,
  color-blind palette, reduced motion, large vitals, units).
- **Instructor controls** behind passcode `1234`: pause/resume,
  time-warp (0.25×–8×), restart — all functional client-side even
  without server endpoints.
- **Demo mode**: if the Rust backend isn't running, the frontend
  automatically synthesizes realistic deteriorating-then-recovering
  vitals so the full UI is interactive standalone.

## Prerequisites

| Tool                     | Minimum     | How to install on macOS                  |
|--------------------------|-------------|------------------------------------------|
| Rust toolchain           | 1.95+       | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js                  | 18+         | `brew install node` or via `mise` / `nvm`|
| `just` (command runner)  | optional    | `brew install just`                      |

Linux: install Rust the same way; install Node from your distro
(`apt install nodejs npm`, `dnf install nodejs`, etc.) or use `nvm`.

The Rust workspace builds with `cargo` directly; `just` is just a thin
wrapper. Every recipe below has the underlying command listed too.

## Install

```sh
git clone https://github.com/jaeHbk/EMS_simulator.git
cd EMS_simulator

# Rust dependencies (compiles workspace; ~1–2 min cold)
cargo build --release --package sim-server

# Web dependencies (~30 s)
cd engine/web && npm install --no-audit --no-fund && cd -
```

## Run

The flagship entry point is **`just demo`** — builds the web bundle and
starts the server on `http://127.0.0.1:8080`, serving both the SPA and
the WebSocket vitals stream from one process:

```sh
just demo
```

Equivalent without `just`:

```sh
# 1. Build the web bundle
cd engine/web && npm install --no-audit --no-fund && npm run build && cd -

# 2. Start the server
cargo run --release --package sim-server -- \
  serve --port 8080 --static-dir engine/web/dist
```

Then open <http://127.0.0.1:8080> in any modern browser. Drag the canvas
to orbit, scroll to zoom.

### Development (hot module reload)

In two terminals:

```sh
# terminal 1 — Rust API + WebSocket on :8080
cargo run --package sim-server -- serve
# (or: just serve)

# terminal 2 — Vite dev server with HMR on :5173, proxied to :8080
cd engine/web && npm run dev
# (or: just web-dev)
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` and `/healthz` to the
Rust server.

### Frontend-only (no Rust backend)

```sh
cd engine/web && npm run dev
```

Open <http://127.0.0.1:5173>. After ~3 seconds of failed WebSocket
connections, **demo mode** activates automatically — synthesizing a
5-minute patient scenario (stable → deterioration → recovery) so the
full UI is interactive without the backend.

### Other recipes

```sh
just build           # cargo build --workspace
just test            # cargo test --workspace
just check           # cargo fmt --check + cargo clippy -D warnings
just sim             # ratatui terminal vitals monitor (no web)
```

Web-only:

```sh
cd engine/web
npm test             # vitest unit tests (43 tests, ~0.5 s)
npm run typecheck    # tsc -b
npm run build        # production bundle
```

## Verifying the install

After `just demo` is running:

```sh
# Liveness
curl http://127.0.0.1:8080/healthz                  # → "ok"

# Server build info
curl http://127.0.0.1:8080/api/version
# → {"version":"sim-server 0.0.1","scenario":"apnea-nrb.macos-arm64"}

# Scenario list
curl http://127.0.0.1:8080/api/scenarios | head -c 200

# Post a no-op action (server echoes it for ~1.2 s)
curl -X POST http://127.0.0.1:8080/api/actions \
  -H 'content-type: application/json' \
  -d '{
    "action_id": "01TESTABCDEFGHJKMNPQRSTVWXY",
    "action_type": "apply_equipment",
    "params": { "equipment": "nrb", "fio2": 0.85 }
  }'
# → 202 Accepted, JSON: { "action_id": "...", "accepted_at_tick": N }
```

## Layout

Top level:

```
crates/   Rust simulation core (deterministic, headless)
  core-time/        Tick + clock + RNG primitives
  physiology/       PhysiologyEngine trait + TraceReplayEngine
  sim-server/       Tokio driver + axum HTTP/WS API + ratatui TUI
  ...
engine/web/   Vite + React 18 + TypeScript + react-three-fiber client
data/         Protocols, drugs, procedures, patients, scenarios, maps
docs/         ADRs, plans, audit findings
tools/        Authoring tools
tests/        Golden scenarios and physiology fixtures
```

The web client is structured as:

```
engine/web/src/
  three/        3D scene: AmbulanceInterior, Patient, Stretcher,
                Monitor3D, equipment/*, lights/, cues/
  ui/
    shell/      AppShell + slot contracts (TopBar, LeftRail, ...)
    monitor/    MonitorShell, WaveformStrip, NumericTile, TrendStrip,
                AlarmBanner, alarms/, audio/, store/
    scenario/   ScenarioPicker (combobox + listbox)
    instructor/ InstructorDrawer + passcode + time-warp
    settings/   SettingsDialog + persisted store
  lib/          stream.ts (WS + types), actions.ts (idempotent posts),
                useInterventions.ts, usePatientCues.ts, format.ts
```

## Quality bar

- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace` all clean.
- `tsc -b` (strict + `noUncheckedIndexedAccess`) clean.
- `vitest run` — 43 tests across 8 files.
- `vite build` — initial JS ~13 KB gz; 3D + drei lazy-loaded behind
  `<Suspense>`.
- `#![forbid(unsafe_code)]` on every crate.
- No `unwrap` / `expect` / `panic` outside `#[cfg(test)]` and `main`.

## Non-negotiable principles (excerpt from steering doc §1.1)

1. **Clinical fidelity first** — physiology is model-driven, not scripted.
2. **Protocol-driven** — protocols are data, not code.
3. **Deterministic** — same seed + same inputs produce the same outcome.
4. **Headless first** — sim core runs without a renderer.
5. **Authoring over hard-coding** — scenarios, patients, protocols are YAML.
6. **Evidence-based** — every clinical constant cites a source.

## Contributing

- Conventional Commits, imperative mood, ≤ 50-char subject.
- Every change to the sim core must include or update a golden-scenario
  or physiology fixture test (steering doc §12).
- Every clinical entry must include a `sources:` field with citations
  (§11.3).
- Every cross-module decision needs an ADR in `docs/adr/`.
