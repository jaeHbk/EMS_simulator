# EMS Simulator — web client

3D web client for the EMS Simulator. Subscribes to a vitals stream from
`sim-server` over WebSocket and renders an ambulance compartment with a
breathing patient + a full clinical monitor.

For install + run instructions see the **root [`README.md`](../../README.md)**.
This file documents the client-only workflows.

## One-shot demo

From the repo root:

```sh
just demo
```

(or the equivalent two-step in the root README). Open
<http://127.0.0.1:8080>.

## Development workflow

```sh
# terminal 1 — Rust API + WebSocket on :8080
cargo run --package sim-server -- serve     # or `just serve`

# terminal 2 — Vite dev server with HMR on :5173, proxied to :8080
cd engine/web && npm run dev                # or `just web-dev`
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` and `/healthz` to the
Rust server, so the same code path runs in dev as in prod.

## Scripts

```sh
npm install        # install dependencies
npm run dev        # Vite dev server
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
npm run typecheck  # tsc -b
npm test           # vitest run (43 tests, ~0.5 s)
```

## Stack

- React 18 + TypeScript 5 (strict + `noUncheckedIndexedAccess`).
- Vite 6 — lazy-loads the 3D scene + drei chunks behind `<Suspense>` so
  first paint is ~13 KB gz.
- `@react-three/fiber` 8 + `@react-three/drei` 9 over Three.js 0.171.
- Zustand 4.5 for monitor / actions / settings state. No middleware
  beyond core.
- Vitest 2.1 for unit tests.
- Vanilla CSS — no framework. Design tokens in `src/styles.css`.

## What's in here

```
src/
  three/                  3D scene
    Scene.tsx             Canvas + OrbitControls + camera
    AmbulanceInterior.tsx Compartment primitives
    Patient.tsx           Breathing patient + cyanosis uniforms
    Stretcher.tsx         Cot frame, mattress, blanket
    Monitor3D.tsx         Bedside CanvasTexture monitor
    cues/                 Shader injectors (cyanosis, pallor)
    equipment/            NRB / BVM / IV / Defib / DrugBox / O2 / Intubation
                          + PickableMesh (hover halo + Html keyboard overlay)
    lights/               InteriorLightRig (rectArea + point + directional)
  ui/
    shell/                AppShell + Slot contracts + TopBar + LeftRail
    monitor/              MonitorShell, WaveformStrip, NumericTile,
                          TrendStrip, AlarmBanner, VitalsAnnouncer
      waveforms/          ECG / pleth / capno / resp synthesizers + tests
      alarms/             Threshold rules + useAlarms (priority + silence)
      audio/              Web Audio singleton + alarm tones
      store/              Zustand: ring buffers + trend window + silence
      hooks/              useFrameClock (single rAF loop)
      tiles/              NumericTile (band-aware; imperative DOM updates)
    scenario/             ScenarioPicker (combobox + aria-activedescendant)
    instructor/           InstructorDrawer + PasscodeGate + TimeWarpControl
    settings/             SettingsDialog + useSettings (localStorage)
  lib/
    stream.ts             WS hook + wire types (frames push to store)
    actions.ts            ULID + postAction + optimistic state + 60s prune
    useInterventions.ts   Watcher reconciling action_id echoes
    usePatientCues.ts     SpO2 → cyanosis, MAP → pallor (piecewise)
    format.ts             Band classifiers + numeric formatters
```

## Wire format

Mirrors `crates/sim-server/src/wire.rs`. The stream begins with a
`Hello`:

```json
{
  "type": "hello",
  "tick_hz": 50,
  "server_version": "sim-server 0.0.1",
  "scenario": "apnea-nrb.macos-arm64"
}
```

Then `VitalsFrame` messages at 50 Hz:

```json
{
  "tick": 1234,
  "sim_time_s": 24.68,
  "heart_rate_bpm": 130.0,
  "systolic_bp_mmhg": 120.0,
  "diastolic_bp_mmhg": 80.0,
  "respiratory_rate_bpm": 0.0,
  "spo2_fraction": 0.65,
  "etco2_mmhg": 12.0,
  "temperature_c": 37.0,
  "interventions": [],
  "run_state": { "mode": "running", "rate_multiplier": 1.0, "elapsed_s": 24.68 }
}
```

Frames are pushed directly into the monitor store from `stream.ts` —
the React tree never re-renders on the 50 Hz feed. Components that need
frame data subscribe to the store (band-aware selectors) or read it
imperatively inside a rAF callback.

## Action API

```sh
POST /api/actions
{
  "action_id": "01J...",          # ULID, idempotency key
  "action_type": "apply_equipment",
  "params": { "equipment": "nrb", "fio2": 0.85 },
  "client_ts_ms": 1737412345678
}
→ 202 { "action_id": "01J...", "accepted_at_tick": 12345 }
```

The server echoes accepted `action_id`s in subsequent
`VitalsFrame.interventions` for ~1.2 s; the client uses this to confirm
optimistic UI state. Trace engine no-ops vitals impact (Pulse FFI will
react in a later slice).

## Accessibility

- Skip-link at the top of `AppShell` jumps to `#scene-main`.
- Equipment is keyboard-accessible via drei `<Html>` overlay buttons —
  Tab cycles, Space/Enter applies.
- Numeric tiles are `tabindex=0` with band-aware `aria-label`s; values
  update via direct DOM mutation at 1 Hz to avoid screen-reader spam.
- A single throttled `aria-live="polite"` `VitalsAnnouncer` summarizes
  abnormal vitals every 10 s, only on band changes.
- `AlarmBanner` carries `role="alert" aria-live="assertive"` only when
  active; silence button countdown updates at 0.2 Hz.
- `ScenarioPicker` is a real combobox-with-listbox using
  `aria-activedescendant`.
- Color-blind palette swaps (deuteranopia / protanopia / tritanopia) in
  Settings; never color-only — paired with shape/icon.
- Full `@media (forced-colors: active)` block for Windows High Contrast.
- `prefers-reduced-motion` (OS) and a Settings override both kill
  flash animations + transitions.
- WCAG AA contrast on every active token.

## Build output

`vite build` produces a code-split `dist/`:

| Chunk           | Raw      | Gzipped  | Lazy?                     |
|-----------------|----------|----------|---------------------------|
| `index.js`      | ~38 KB   | ~13 KB   | initial                   |
| `Scene.js`      | ~270 KB  | ~108 KB  | yes (loaded on canvas)    |
| `fiber.js`      | ~302 KB  | ~97 KB   | yes                       |
| `three.js`      | ~689 KB  | ~177 KB  | yes                       |

First paint never blocks on Three.js.
