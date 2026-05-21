# Session handoff — 2026-05-20

UX-refresh session. Two committed pushes to `origin/mainline`:

- **`88b23c7`** — `feat: UX refresh — clinical monitor, ambulance scene,
  equipment + actions` (80 files changed, +8 237 / −487).
- **`2e09e15`** — `docs: rewrite READMEs for the post-UX-refresh demo`.

The deeper-fidelity track (Pulse FFI, gRPC, scenarios, replay) lives in
[`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) — untouched. The plan that
drove this session is [`UX_REFRESH_PLAN.md`](UX_REFRESH_PLAN.md); the
audit closeout is [`AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md).

## What's done

11 of the 12 originally-scoped tasks are complete. Highlights:

### Backend (Rust)

- `VitalsFrame` extended with `interventions: Vec<String>` and
  `run_state { mode, rate_multiplier, elapsed_s }` — backwards-compat
  via client-side normalization.
- New types: `ActionEnvelope`, `ActionAccepted`, `Scenario`,
  `ScenarioEvent`, `RunMode`.
- `POST /api/actions` — accepts ULID-keyed JSON, drops to a Tokio mpsc,
  driver drains every tick and snapshots accepted IDs into the next
  ~1.2 s of `VitalsFrame.interventions`. Trace engine no-ops vitals
  impact (Pulse FFI will translate later).
- `GET /api/scenarios` — static list (apnea/NRB stub with three
  scripted events) — unblocks the picker UI.
- Smoke test extended: now drives every new endpoint end-to-end. 22+
  Rust tests pass; `cargo fmt --check` + `clippy -D warnings` clean.

### Frontend (React + Three.js)

- **App shell + slot contracts** (`ui/shell/`) — typed slots so each
  slice landed in parallel without merge churn.
- **Clinical monitor** (`ui/monitor/`) — three synthesized waveforms
  (Lead-II ECG with PQRST Gaussians + Bazett QT, pleth with dicrotic
  notch + SpO₂-scaled amplitude, capnogram with 4-phase split). Sweep-
  cursor canvas renderer with mm grid. 6 numeric tiles with band-aware
  React renders + 1 Hz imperative DOM updates. Float32Array ring-buffer
  trend strips (30 s / 60 s / 5 m, ~360 KB total). Priority-tiered
  alarm banner with IEC 60601-1-8 tone scheduling, 2-min silence,
  Web Audio gesture-gated lazy AudioContext.
- **Ambulance interior** (`three/AmbulanceInterior.tsx`) — primitives
  build (~6–9k tris): floor, walls, ceiling, bulkhead, rear doors,
  bench seat, upper cabinets, O₂ wall outlet, grab rails, windows.
  Three-light interior rig (rectAreaLight + warm fill + cool exterior
  directional). Camera retuned + OrbitControls bounded.
- **Patient cues** (`lib/usePatientCues.ts` + `three/cues/`) — cyanosis
  + pallor uniforms via `MeshStandardMaterial.onBeforeCompile`.
  Piecewise SpO₂ → cyanosis (1.0→0, 0.94→0.05, 0.88→0.35, 0.80→0.7,
  0.70→1.0) and MAP → pallor. Smoother breath envelope (1:2 inhale /
  exhale, sin² rise + cos² fall).
- **Equipment + actions** (`three/equipment/` + `lib/actions.ts`) —
  seven primitive items on the bench (NRB, BVM, IV pole, defib, drug
  box, O₂ tank, intubation kit). `PickableMesh` with hover halo + drei
  `<Html>` keyboard overlay. ULID-minting + optimistic-state +
  reconciliation watcher + 60 s retention.
- **Scenario picker** (`ui/scenario/ScenarioPicker.tsx`) — combobox-
  with-listbox using `aria-activedescendant`; outside-click + Esc
  return focus to trigger; active row scrolls into view.
- **Instructor drawer** (`ui/instructor/`) — passcode `1234` →
  pause/resume + time-warp segmented control + restart-confirm. Server
  RPCs **stubbed** (logs intent) until `/api/run/*` endpoints land.
- **Settings dialog** (`ui/settings/`) — native `<dialog>`; audio
  mute/volume, color-blind palette (none/deut/prot/trit), reduced-
  motion override, large-vitals, units. Persisted in `localStorage`.
- **Single rAF clock** (`ui/monitor/hooks/useFrameClock.ts`) — every
  paint-time consumer subscribes to one loop instead of spinning its
  own.
- **Frame flow refactor** — WS handler pushes directly to the monitor
  store; React state carries only `status` (low-frequency). Patient,
  Monitor3D, and the entire shell never re-render on the 50 Hz feed.

### Audit closeout

A11y + perf audit (subagents → punch list → fixes) closed all
must-fixes: keyboard-accessible equipment, throttled aria-live (single
`<VitalsAnnouncer>` instead of 6×/s tile spam), real combobox structure
on the scenario picker, skip-link, `forced-colors: active` block,
contrast bumps on `--fg-mute` / `--alarm` / `--alarm-bg`, dropped one
shadow system, switched Monitor3D history to Float32Array ring,
pruned actions Map, `useReducedMotion` subscribes to OS pref changes.
Full punch list + verifying-on-screen items in
[`AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md).

### Quality bar (final)

- `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test
  --workspace` — all clean; smoke test drives every new endpoint.
- `tsc -b` (strict + `noUncheckedIndexedAccess`) clean.
- `vitest run` — **43 tests / 8 files** all pass (waveforms, ring
  buffer, alarm rules, patient cues, action store).
- `vite build` — initial JS **13 KB gz**; 3D + drei + three lazy.
- Verified live: `just demo` serves on `:8080`; HTML, scenarios JSON,
  WS Hello + frames, `POST /api/actions` 202 + echo round-trip ~700 ms.

### Documentation refreshed

- [`UX_REFRESH_PLAN.md`](UX_REFRESH_PLAN.md) — the whole plan, kept as
  reference.
- [`AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md) — closeout doc; what was
  fixed in code vs what needs a real screen.
- Root [`README.md`](../README.md) + [`engine/web/README.md`](../engine/web/README.md)
  — fully rewritten as install + run guides.

## What's NOT done (intentional deferrals)

These are the open tasks in priority order. Pick whichever the next
session's user wants; none block the others.

### 1. Visual verification on a real screen (highest priority)

I never ran the app in a real browser — I've been working from typecheck
+ build + headless WS smoke. Open <http://127.0.0.1:8080> via `just
demo` and confirm:

- Ambulance interior renders without z-fighting / clipping; camera
  framing is right.
- Monitor3D's screen actually faces the camera at the new position
  (rotation `[0, π/3, 0]` was reasoned about, not eyeballed).
- Patient torso/head visibly tints blue as SpO₂ falls in the apnea/NRB
  trace (cyanosis uniform).
- Three waveforms sweep correctly without flicker; numeric tiles change
  band on threshold crossings; trend sparklines populate after ~30 s.
- Alarm banner flashes red around t≈240 s (SpO₂ < 90); pressing
  SILENCE unlocks Web Audio and silences for 2 min with countdown.
- Equipment hover halo + click → snap to attach point + green
  attached-dot (NRB / BVM / IV / defib have attached poses; drug box /
  O₂ / intubation stay on bench).
- Scenario picker dropdown opens, search filters, arrow-key nav.
- Settings dialog: color-blind palettes swap the alarm/abnormal/accent
  triad live; reduced-motion override actually kills flashes; large-
  vitals enlarges tile font.
- Instructor drawer: passcode `1234` unlocks; time-warp buttons fire
  the (stubbed) RPC and console-warn.
- Skip-link is visible on first Tab from the document; equipment is
  keyboard-reachable; screen reader (NVDA / VoiceOver) reads
  `VitalsAnnouncer` on band changes.

### 2. Slice 1B: real CC0 patient GLB (task #12)

Currently the patient is primitive shapes. Plan stays as written:

- Source Quaternius "Ultimate Modular Men" (CC0). Add to
  `engine/web/public/models/patient.glb`. Author morph targets in
  Blender: `chestExpand` (~0.04 unit Z-out on rib cage), `eyeBlink`
  (left+right eyelids).
- Vertex-color cyanosis mask in `COLOR_0` (red = lips, green =
  fingertips/nail beds).
- DRACO decoder via `postinstall` script: copy
  `node_modules/three/examples/jsm/libs/draco/` → `public/draco/`.
- Replace `Patient.tsx` capsule torso with `useGLTF('/models/patient.glb')`.
  Drive `morphTargetInfluences[chestIdx]` from RR; gate `eyeBlink` on
  `frame.gcs_verbal >= 4` (still null until Pulse FFI).
- Move the cyanosis `onBeforeCompile` to per-material slot (lips,
  skin, nailbed) — uses the vertex-color mask so cyanosis is
  localized.
- Keep `PatientPrimitive.tsx` as the Suspense fallback / `VITE_PATIENT_MODE
  =primitive` escape hatch.
- Record license + author + download date in
  `engine/web/public/models/LICENSES.md`.
- Bundle guardrail: `patient.glb` ≤ 800 KB; CI check via
  `du -sb public/models`.
- Optimize via `gltfpack -cc -tc` in a `pnpm models:optimize` script.

### 3. Server-side run-control RPCs

The instructor drawer fires console-warns today. Add:

- `POST /api/run/pause`
- `POST /api/run/resume`
- `POST /api/run/rate { multiplier: f64 }`
- `POST /api/run/seek { sim_time_s: f64 }`
- `POST /api/run/restart`

The driver already populates `run_state` on every frame; flipping
`mode` to `Paused` should make `t.tick().await` skip without advancing
the clock. Wire from the existing `SimHandle` via a second mpsc or a
shared atomic.

In the client: replace the stubs in `ui/instructor/useRunControls.ts`
with real `fetch()` calls.

### 4. Scenario switching (real, not no-op)

`ScenarioPicker.handleSelect` currently closes the popover without
acting. Wire it to:

- `POST /api/scenarios/:id/start` (or restart with a `scenario_id`
  body on the existing `/api/run/restart`).
- Server-side: load a different trace + reset the clock.
- Client-side: `monitorStore.resetHistory()` on scenario change so
  trend strips don't carry across scenarios.

### 5. Mechanical perf wins (only if profile shows them)

Documented in [`AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md) "Pending":

- `<instancedMesh>` for repeated geometry (4 stretcher legs + 4 wheels,
  3 cabinet handles, 2 windows, 2 rail posts) — 1 draw call instead of
  N each.
- Merge static cabinet/wall meshes into a single `BufferGeometry` per
  side wall.
- CSS alarm flash on `opacity` (composite-only) instead of
  `background-color` (paint).
- Vite `manualChunks` to split unused drei pieces from the `fiber`
  chunk.

### 6. NVDA / VoiceOver pass + Windows High Contrast verification

ARIA correctness is in place; cadence + tone of announcements only
shows up in a real screen-reader session. Pick the SR/OS pair the
target classroom will use and run the golden path.

## Tactical tips for next session

- The two top-priority items (#1 visual verify, #2 GLB) are independent
  and equally interesting — pick by what's easier to start (visual
  verify is 30 minutes of clicking; GLB takes a Blender session).
- The slot-contract architecture (`ui/shell/Slot.tsx`) makes most new
  work additive: don't re-thread props through the shell, use the
  store + lazy-mounted slot.
- 50 Hz feed rule: never let it touch React state. Push to the store;
  read in `useFrame` / rAF / band-aware selector. Verified by checking
  React Devtools profiler when working on a hot path.
- Audio is silent by default and gesture-gated. First user click on
  the SILENCE button or a Settings toggle unlocks `AudioContext`.
- Equipment "attaches" but does not change vitals — that's expected
  (trace engine no-op). Pulse FFI later turns the no-op into a real
  reaction. The action plumbing is complete and verified end-to-end.
- ULID format note: `newActionId()` uses Crockford-base32 (excludes
  I/L/O/U). The vitest suite pins this to a regex.
- The `useFrameRecorder` hook was deleted mid-session; if you see it
  referenced anywhere it's stale.

## Files of interest

- [`UX_REFRESH_PLAN.md`](UX_REFRESH_PLAN.md) — the whole plan.
- [`AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md) — what's verifiable vs not.
- `engine/web/src/lib/stream.ts` — WS hook + frame-to-store pipe.
- `engine/web/src/ui/monitor/store/monitorStore.ts` — Zustand store +
  ring buffers; the heart of the per-frame data flow.
- `engine/web/src/ui/monitor/MonitorShell.tsx` — composition of
  waveforms + tiles + trend strips.
- `engine/web/src/three/Scene.tsx` — top-level scene composition.
- `crates/sim-server/src/{wire,sim,web}.rs` — Rust API + driver +
  action mpsc.
- `crates/sim-server/tests/ws_smoke.rs` — end-to-end smoke test
  including the actions echo round-trip.
