# UX refresh plan — 2026-05-20

A 2–3 week major UI/UX refresh of the EMS Simulator web client. This is an
**alternate** track to the deeper-fidelity plan in
[`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) (Pulse FFI, gRPC control plane,
scenarios, replay) — both can land in parallel where seams allow, but this
doc is what to execute *first* if the goal is to make the demo feel like a
real training product.

## Goals

- Replace the primitive-shape patient + box stretcher with a stylized-clinical
  ambulance compartment scene.
- Replace the toy `Monitor3D` with a real EMS bedside monitor: multi-waveform
  (ECG / pleth / capnogram), priority-tiered alarms, trend strips.
- Add visible patient deterioration cues tied to live vitals (cyanosis,
  pallor, sweat, chest rise).
- Add equipment interactions (NRB / BVM / IV / defib / intubation kit) with
  click-to-attach and a server-authoritative action stream.
- Redesign the app shell: scenario picker, instructor controls, settings,
  proper design tokens (separate "abnormal vital" from "alarm").

## Non-goals

- Pulse FFI integration. Cyanosis / pallor / chest-rise / ECG synthesis are
  client-side approximations of existing `VitalsFrame` fields; GCS, pupils,
  sweat rate, JVD are flagged but **deferred** until Pulse FFI lands.
- gRPC. Scenario + run-control RPCs use JSON over `POST` until the typed
  surface arrives.
- Photoreal patient or PBR ambulance interior. Stylized clinical only.

## Quality bars (in addition to existing bars in MILESTONES.md)

- Scene renders ≥ 60 fps on a 2020-era integrated GPU at 1080p.
- Web bundle: total `/models/*.glb` ≤ 6 MB uncompressed, < 3 MB gzipped.
- Total JS gzipped ≤ 400 KB initial; 3D + monitor lazy-loaded.
- Alarm color palette respects WCAG AA (≥ 4.5:1 on `#0a0e14`) and works
  for deuteranopia / protanopia (paired with icon + text).
- `--alarm` (red) is **only** used for active alarms; abnormal-but-not-alarming
  vitals use `--abnormal` (amber). Today's `--bad` overloads both — fix it.
- No new `unsafe`, `unwrap`, `expect`, `panic` in non-test Rust.
- Reduced-motion respected on every animation (chest rise, alarm flash,
  attach-tween, vital pulse).

---

## Wire-format additions (backend, minimal)

These unlock the UI work; they don't require Pulse FFI.

1. **`POST /api/actions`** — accept ULID-keyed action JSON, echo accepted
   actions back via a new `interventions: ActionId[]` field on `VitalsFrame`.
   Trace engine no-ops vitals impact but echoes the action so the 3D
   "attached" state is server-authoritative.

   ```json
   POST /api/actions
   { "action_id": "01JABC...",
     "action_type": "apply_equipment",
     "params": { "equipment": "nrb", "attach_point": "face", "fio2": 0.85 },
     "client_ts_ms": 1737412345678 }
   → 202 { "action_id": "01JABC...", "accepted_at_tick": 12345 }
   ```

2. **`GET /api/scenarios`** — list available scenarios. Shape:
   `{ id, name, difficulty, duration_s, chief_complaint, events[] }`.

3. **`POST /api/run/{pause,resume,rate,seek,restart}`** — instructor RPCs.
   Reflect run state in a new `run_state` field on `VitalsFrame` (or a
   sidecar `RunState` message): `running | paused | restarting`, current
   `rate_multiplier` (0.25–8×), elapsed `sim_time_s`.

4. **Optional sidecar `PatientStateFrame` at 5 Hz** — fields the trace
   engine can populate from existing vitals via piecewise approximations:
   `cyanosis_lips`, `cyanosis_fingertips`, `pallor`, `chest_rise_amplitude`.
   Don't bloat the 50 Hz hot path. Pulse-only fields (`gcs_*`, `pupil_*`,
   `sweating`, `jvd`) reserved but unset.

---

## Design tokens (replace `:root` in `engine/web/src/styles.css`)

Calmer clinical palette; explicit separation of "abnormal" vs "alarm".

```css
:root {
  --bg: #060b14;     --bg-1: #0b1220;   --bg-2: #131b2a;   --bg-3: #1b2436;
  --fg: #e7ecf2;     --fg-dim: #94a3b8; --fg-mute: #64748b;
  --line: #223047;   --line-strong: #324663;

  --accent:    #34d3a3;   /* clinical green, calmer than #3ddc97 */
  --accent-2:  #5ab0ff;   /* informational blue */
  --abnormal:  #f5b042;   /* abnormal vital — NOT an alarm */
  --alarm:     #ef4358;   /* RESERVED for active alarms only */
  --alarm-bg:  #2a0e15;
  --ok:        var(--accent);

  --shadow-1: 0 1px 2px rgba(0,0,0,.4);
  --shadow-2: 0 6px 16px rgba(0,0,0,.45);
  --shadow-3: 0 16px 40px rgba(0,0,0,.55);

  --radius-1: 4px;  --radius-2: 8px;  --radius-3: 14px;
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 24px;  --space-6: 32px;  --space-7: 48px;

  --font-sans: ui-sans-serif, "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;

  --fs-12: .75rem; --fs-13: .8125rem; --fs-14: .875rem; --fs-16: 1rem;
  --fs-vital-sm: 1.5rem; --fs-vital: 2.25rem; --fs-vital-lg: 3.25rem;
  --lh-tight: 1.1; --lh-body: 1.45;

  --dur-1: 120ms; --dur-2: 200ms; --dur-3: 320ms;
  --ease-std:  cubic-bezier(.2, .0, .0, 1);
  --ease-emph: cubic-bezier(.2, .0, .0, 1.2);
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-1: 0ms; --dur-2: 0ms; --dur-3: 0ms; }
}
```

State management: introduce **Zustand** (~1 KB gz) at week-2 for cross-cutting
state (`runStore`, `scenarioStore`, `settingsStore`, `monitorStore`). Keep
the high-frequency `frame` on prop-drill / context selectors — never on
React state at 50 Hz.

---

## App-shell layout

```
+-----------------------------------------------------------------------------+
| BRAND |  Scenario v   |  RUN: PAUSED  T+00:04:12  1×  | live 50Hz |  ⚙    |  48 px
+----+------------------------------------------------------------+-----------+
| L  |                                                            |           |
| e  |                                                            |  RIGHT    |
| f  |                                                            |  RAIL     |
| t  |              3D SCENE (canvas, full bleed)                 |  monitor  |
| R  |                                                            |  ~24 rem  |
| a  |                                                            |           |
| i  |                                                            |           |
| l  |                                                            |           |
| 14r|                                                            |           |
+----+------------------------------------------------------------+-----------+
|                ALARM BANNER (high-pri red / med amber / low cyan)    [SIL]  |  44 px
+-----------------------------------------------------------------------------+
```

Grid: `grid-template-columns: auto 1fr auto` / rows `48px 1fr auto`.
Left rail collapses to icon-rail (3 rem) with localStorage persistence.

**Responsive**:
- ≥ 1280: as above.
- 768–1280: left rail collapses to icon-only by default; right rail narrows
  to 20 rem.
- < 768: left rail = drawer (hamburger); right rail = bottom sheet with
  vitals tabs; alarm banner stays pinned.

---

## Slice 1 — 3D scene + assets

### Patient

- **Source:** Quaternius "Ultimate Modular Men" (CC0, ~3–8k tris).
  https://quaternius.com/packs/ultimatemodularmen.html
- **Reference for rigging precedent:** Khronos `CesiumMan` glTF sample.
- **Breathing:** authored morph target `chestExpand` (~0.04 unit Z-out on
  rib cage). Drive `morphTargetInfluences[chestIdx] = 0.5 + 0.5*sin(phase)`,
  amplitude scaled by RR (existing `Patient.tsx` math). Avoid bone-rig +
  scale: deforms shoulders.
- **Eye blink:** second morph `eyeBlink`, Poisson-ish (mean 4 s) gated by
  `frame.gcs_verbal >= 4`. Held off until GCS is in the wire.
- **Cyanosis:** vertex-color mask (red channel = lips, green = fingertips)
  baked in Blender. `MeshStandardMaterial.onBeforeCompile` injects
  `uniform float uCyanosis` lerping skin → `#5a7a9c` weighted by mask.

### Ambulance interior

Build from primitives + drei `RoundedBox` (no asset license review).
Budget ~6–9k tris.

- Floor plate, two side walls with bench cutout, ceiling, rear doors
  (closed), bench seat, upper cabinet row, O2 wall outlet, grab rails,
  monitor bracket.
- **Camera:** `position=[2.4, 1.7, 2.2]`, `lookAt=[0, 1.05, 0]`, `fov=36`.
  OrbitControls: `minDistance=2`, `maxDistance=4.5`,
  `minPolarAngle=π/4`, `maxPolarAngle=π/2.05`,
  `minAzimuth=-π/2.5`, `maxAzimuth=π/2.5`.
- **Lighting:** overhead `rectAreaLight` (LED panel, `#f4f7ff`, intensity 4)
  + warm interior `pointLight` (`#ffd6a5`) + cool exterior `directionalLight`
  through window (`#9ec5ff`). Drop the `warehouse` HDRI; use `apartment`
  preset or a baked `public/hdri/ambulance.hdr`.
- Materials: flat color, `roughness ~0.7`, no PBR maps. Bake AO once via
  `<AccumulativeShadows>`.

### Equipment

| Item            | Source                          | Tris  | Pick handler              |
|-----------------|---------------------------------|-------|---------------------------|
| NRB mask        | Primitive (sphere + tube)       | ~200  | `useCursor` + `onClick`   |
| BVM             | Primitive (ellipsoid + cylinder)| ~300  | `useCursor` + `onClick`   |
| IV bag + pole   | Primitive                       | ~400  | `useCursor` + `onClick`   |
| Defibrillator   | GLB (Sketchfab CC0; LP-15-like) | ~1.5k | drei `<Bvh firstHitOnly>` |
| Intubation kit  | Primitive (case + laryngoscope) | ~600  | `useCursor` + `onClick`   |
| Drug box        | Primitive                       | ~150  | `useCursor` + `onClick`   |
| O2 tank         | Primitive (capped cylinder)     | ~400  | `useCursor` + `onClick`   |

### Asset pipeline

- glTF 2.0 binary (`.glb`) + DRACO + KTX2 textures.
- `useGLTF.preload(...)` at module top; per-asset `<Suspense>` so one slow
  asset doesn't block the canvas.
- Path: `engine/web/public/models/`. Decoder: `engine/web/public/draco/`
  copied via `postinstall` from `node_modules/three/examples/jsm/libs/draco/`.
- **Bundle guardrails:** patient ≤ 800 KB, defib ≤ 500 KB, accessories
  ≤ 150 KB each, total ≤ 6 MB raw. CI check: `du -sb public/models`.
- `gltfpack -cc -tc` step in `pnpm models:optimize`.

### New / modified files (`engine/web/src/three/`)

- `Scene.tsx` — modify: lighting rig, camera, suspense.
- `AmbulanceInterior.tsx` — new: walls, cabinets, bench, O2 outlet.
- `Patient.tsx` — modify: load GLB, drive morphs.
- `patientMaterial.ts` — new: cyanosis `onBeforeCompile` injector.
- `Stretcher.tsx` — modify: retune position to fit interior.
- `Monitor3D.tsx` — modify: mount on cabinet bracket; render the *same*
  off-screen canvas the 2D `MonitorShell` paints (zero duplication).
- `equipment/{NrbMask,Bvm,IvPole,Defibrillator,IntubationKit,DrugBox,OxygenTank}.tsx`
- `equipment/index.ts` — barrel + `useGLTF.preload`.
- `lights/InteriorLightRig.tsx` — three-light setup +
  `RectAreaLightUniformsLib.init()` (easy to forget).
- `interaction/PickableMesh.tsx` — `useCursor` + outline pulse + a11y wrapper.
- `interaction/useSelection.ts` — Zustand store for picked equipment.
- `assets.ts` — typed paths to all `/models/*.glb`.
- `PatientPrimitive.tsx` — keep current primitive patient as Suspense
  fallback + `VITE_PATIENT_MODE=glb|primitive` feature flag.

`engine/web/public/models/`: `patient.glb`, `defibrillator.glb`, plus
`LICENSES.md` recording author + download date + license per asset.

---

## Slice 2 — Clinical monitor

The on-screen 2D monitor becomes **primary**. `Monitor3D`'s `CanvasTexture`
reads the same off-screen canvas at half-res — the 3D prop becomes a
faithful in-world mirror without duplicate paint code.

### Layout (≥ 1280)

```
+--------------------------------------------------------------+
|  ALARM BANNER  (high red / med amber / low cyan)       [SIL] |  44 px
+--------------------------------+-----------------------------+
| ECG II   25mm/s  ×1   [HR 78]  |  HR    78  bpm   (green)    |  ~120 px
|  ~~~/\~~~/\~~~/\~~~/\~~~/\~~~  |                             |
+--------------------------------+-----------------------------+
| PLETH         [SpO2 96]        |  SpO2  96  %                |  ~90 px
|  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿  |                             |
+--------------------------------+-----------------------------+
| CO2  mmHg     [ETCO2 38 / RR16]|  RR    16  /min             |  ~90 px
|  __--__--__--__--__--__--__--  |  ETCO2 38  mmHg             |
+--------------------------------+-----------------------------+
|  TREND: HR ▁▂▃▅▇▆▅▄  [30s|60s|5m]   BP 118/76   T 36.8 °C    |  56 px
+--------------------------------------------------------------+
```

Left column = `minmax(0, 1fr)`; right rail = `clamp(220px, 28%, 360px)`.
Numerics use `font-variant-numeric: tabular-nums` (already in tokens).

**Collapse**: ≤ 1024 hide Temp + Resp wave, merge BP under HR. ≤ 720 drop
right rail, waveforms full-bleed, numerics overlay top-right.

### Waveforms (all client-synthesized from existing `VitalsFrame`)

| Wave           | Source                | Refresh        | Sweep      | Color       | Height |
|----------------|-----------------------|----------------|------------|-------------|--------|
| Lead II ECG    | HR                    | 250 Hz / 60 fps| 25 mm/s    | `#34d3a3`   | 120 px |
| Pleth (SpO2)   | SpO2 + HR             | 100 Hz / 60 fps| 25 mm/s    | `#41c7ff`   | 90 px  |
| Capnogram      | RR + ETCO2            | 50 Hz / 60 fps | 12.5 mm/s  | `#ffd166`   | 90 px  |
| Resp impedance | RR (toggle)           | 50 Hz          | 6.25 mm/s  | `#c8a2ff`   | 70 px  |

- **ECG synth:** PQRST as sum of Gaussians (P @ -0.20s σ=0.04, Q @ -0.04
  σ=0.012 amp=-0.15, R @ 0 σ=0.014 amp=1.0, S @ +0.04 σ=0.012 amp=-0.25,
  T @ +0.30 σ=0.06 amp=0.35). RR-interval = 60/HR. Bazett QT = 0.40·√RR.
  ±2 % HRV jitter, ±1 % amplitude noise, 0.05 mV baseline wander.
- **Pleth:** skewed sine `(1-cos)·exp(-k·phase)`, ~150 ms lag from ECG.
  Amplitude scales with `spo2_fraction`, floor at 60 %, dicrotic notch at
  0.45 of cycle.
- **Capno:** piecewise — phase I baseline 0; II steep rise; III plateau at
  `etco2_mmhg`; IV vertical drop; period = 60/RR.

All synths are pure functions of `(t, vitals)` driven by a single `rAF`
clock (`useFrameClock`). No server changes.

### Alarm system

Thresholds (adult; tunable in scenario config later):

| Vital   | High alarm                   | Medium alarm           |
|---------|------------------------------|------------------------|
| HR      | < 50 or > 130                | —                      |
| SpO2    | < 90 %                       | < 94 %                 |
| RR      | < 8 or > 30                  | < 12 or > 24           |
| ETCO2   | < 25 or > 60                 | < 30 or > 50           |
| SBP/DBP | < 90 or > 180 / DBP > 110    | —                      |
| Temp    | < 34 °C or > 40 °C           | < 35 °C or > 38.5 °C   |

**Priority (IEC 60601-1-8)**:
- High: red (`--alarm`) flash 2 Hz + tri-tone burst (C5-A5-F5) every 10 s.
- Medium: amber (`--abnormal`) flash 0.6 Hz + tri-tone every 25 s.
- Low: cyan steady + single tone, no repeat.

Color always paired with shape (▲ ■ ●) for color-blind safety. Web Audio
`AudioContext` is a singleton in `lib/audio.ts`, lazy-started on first user
gesture (the "Start scenario" click). SpO2 desat tone uses descending pitch
(Masimo pattern, ~30 Hz/%). Silence (2 min) lives in
`monitorStore.silenceUntil`, persisted in `sessionStorage`. Silence
suppresses audio only — visuals still flash.

### Trend strips

Per-vital `Float32Array` ring at server tick rate (~50 Hz). 5 min × 50 Hz
× 4 B × 6 vitals = **360 KB**. Decimate to ~120 points for sparkline.
Buffer lives in Zustand store outside React; tiles subscribe via selector
keyed on `band` (so they re-render only on threshold crossing, not at 50 Hz).

### New files (`engine/web/src/ui/monitor/`)

- `MonitorShell.tsx` — top-level grid; replaces `VitalsPanel` in `App.tsx`.
- `AlarmBanner.tsx` — priority-driven banner + silence countdown.
- `NumericTile.tsx` — one HR/SpO2/RR/ETCO2/BP/Temp tile.
- `TrendStrip.tsx` — sparkline canvas, 30 / 60 / 300 s toggle.
- `WaveformStrip.tsx` — generic strip; props: synth fn, color, mm/s, height.
- `waveforms/{ecg,pleth,capno,resp}.ts` — pure synth functions.
- `waveforms/renderer.ts` — shared canvas painter (sweep cursor, mm grid).
- `alarms/rules.ts` — pure threshold table → `AlarmEvent[]`.
- `alarms/useAlarms.ts` — store subscription + silence countdown.
- `audio/tones.ts` — Web Audio singleton + `playHigh / playMedium /
  playSpo2(value)`.
- `store/monitorStore.ts` — Zustand: ring buffers, silence, trend window.
- `hooks/useFrameClock.ts` — single rAF clock; siblings subscribe.
- `Monitor3D.tsx` — modify: take `getCanvas()` ref instead of painting itself.

### Accessibility

- Keyboard: `S` silence, `T` cycle trend window, `1/2/3` focus waveform,
  `?` shortcut help.
- Banner: `role="alert" aria-live="assertive" aria-atomic="true"`. Fire
  announcement only on band transition (not every sample).
- Tiles: `aria-live="polite"` on the numeric span, updated on band change.
- `prefers-reduced-motion`: no flash, no sweep wipe (full-strip redraw),
  no tile pulse.
- `forced-colors: active`: drop gradients; use system colors for strokes.

---

## Slice 3 — Patient cues + equipment interaction

### Cues (client approximations of existing fields)

| Cue                          | Driver                       | Available now? |
|------------------------------|------------------------------|----------------|
| Lip / fingertip cyanosis     | piecewise from `spo2_fraction` (1.0→0, 0.94→0.05, 0.88→0.35, 0.80→0.7, 0.70→1.0) | ✅ |
| Pallor                       | derived from MAP             | ✅              |
| Chest rise amplitude         | `respiratory_rate_bpm` (existing math, replace scale with morph) | ✅ |
| Sweat sheen                  | sympathetic tone             | ❌ Pulse-only   |
| GCS-gated eye blink          | `gcs_verbal`                 | ❌ Pulse-only   |
| Pupil size + reactivity      | `pupil_*`                    | ❌ Pulse-only   |
| JVD                          | CVP                          | ❌ Pulse-only   |

Render technique:

| Cue                   | Technique                                                    |
|-----------------------|--------------------------------------------------------------|
| Cyanosis lips/fingers | shader uniform `uCyanosis` on `MeshStandardMaterial.onBeforeCompile`, lerp via vertex-color mask |
| Pallor                | uniform `uPallor` desaturating + lifting toward `#e8d8c8`     |
| Sweat                 | drop `roughness`, raise `clearcoat` (`MeshPhysicalMaterial`)  |
| Chest rise            | `chestExpand` morph target (replaces uniform-scale)           |
| Eye blink             | `eyeBlink` morph                                              |
| Pupils                | child sphere scale + emissive flash overlay                   |

Tiny cyanosis sketch:

```ts
const lipsMat = materials.lips as MeshStandardMaterial;
lipsMat.onBeforeCompile = (s) => {
  s.uniforms.uCyanosis = cyanosisRef;
  s.fragmentShader = s.fragmentShader.replace(
    '#include <output_fragment>',
    `vec3 cy = vec3(0.18, 0.30, 0.55);
     gl_FragColor.rgb = mix(gl_FragColor.rgb, cy, uCyanosis.value);
     #include <output_fragment>`);
};
useFrame(() => { cyanosisRef.value = piecewiseSpO2(frame?.spo2_fraction ?? 1); });
```

A single `usePatientCues(frame)` hook updates all uniforms — no per-mesh
re-renders. Frames arrive at 50 Hz but `PatientStateFrame` (when added) at
5 Hz; **lerp client-side** to avoid stair-stepping.

### Equipment interaction

```ts
type EquipmentId = 'nrb' | 'bvm' | 'iv_line' | 'defib_pads' | 'ett';
type AttachPointId = 'face' | 'left_antecubital' | 'chest_anterior' | 'airway';
interface EquipmentItem {
  id: EquipmentId; label: string; gltf: string;
  attachPoint: AttachPointId; appliesIntervention: InterventionKind;
  a11yKey: string; // e.g. 'n' for NRB
}
```

Attach points are named `<group>` nodes in `Patient.tsx`. Hover →
`<Outlines>` + cursor pointer + `aria-live` hint. Click → animate to
attach point (Three.js lerp over 400 ms, `prefers-reduced-motion` jump-cut)
→ `POST /api/actions`.

**State of truth = server.** Local state holds *animation* only. The
attached set comes from `frame.interventions`. Optimistic `pendingActions`
Map keyed by `action_id`, cleared when server echoes; 5 s timeout reverts
with toast "server did not acknowledge". Trace engine echoes the action
without affecting vitals — document as expected demo behavior.

### New files

```
engine/web/src/three/equipment/
  EquipmentTray.tsx          // cart group, layout
  EquipmentItem.tsx          // pickable mesh + outline
  AttachPoints.tsx           // named anchor groups
  useEquipmentInteraction.ts // hover/select/snap state machine
  useAttachAnimation.ts      // lerp tween tray → anchor
  registry.ts                // EquipmentItem[] catalog

engine/web/src/lib/
  actions.ts                 // postAction(), ULID, retry, dedupe
  usePatientCues.ts          // frame → {cyanosis, pallor, ...}
  useInterventions.ts        // selector over latest frame

engine/web/src/three/cues/
  PatientCueShaders.ts       // onBeforeCompile injectors
```

### Accessibility

- Each `EquipmentItem` exposes an invisible `<button>` overlay via drei
  `<Html>` with `aria-label`. Tab cycles, Space/Enter picks, arrow keys
  cycle attach points, Esc cancels.
- `aria-live="polite"` region announces e.g. "Non-rebreather mask applied
  to face. SpO2 rising."
- Cyanosis is **never** color-only: paired with side-panel chip "Lips:
  cyanotic (mild / moderate / severe)" + tooltip on the model.
- Outline uses thickness + dashed pattern, not just hue.

---

## Slice 4 — App shell, scenario picker, instructor controls

### Scenario picker

Always-visible select in top bar opens a **popover** (modal only on cold
start). Row: name (bold) · difficulty pill · clock + duration · chief
complaint (dimmed). Sidebar: keyword filter, difficulty chips. Loading:
3-row skeleton with `--bg-2` shimmer; failure: inline retry. Switching
mid-run: `<dialog>` confirm "Discard current run?" with Cancel as default
focus. Keyboard: `/` focus search, ↑/↓ navigate, Enter select, Esc close,
focus-trap, `aria-activedescendant`.

### Instructor controls

Default UI: **collapsible bottom-anchored drawer** above the alarm banner,
hidden behind passcode. Contains pause/resume, time-warp segmented control
(`0.25 / 0.5 / 1× / 2 / 4 / 8`), restart (confirm), event timeline scrubber.
Heavy use case: `/instructor` route renders the same shell with the drawer
pinned open, larger timeline, and a tail-following action log.

All controls wire as **server RPCs** — 50 Hz tick stays server-authoritative,
UI reflects `run_state` from each frame. Optimistic local toggle, rollback
on RPC failure. Time-warp slider debounced 150 ms.

### Settings modal

- **Display:** theme (auto/light/dark — light is hidden behind a "compact
  preview" warning since clinical UIs stay dark), large-vitals toggle.
- **Audio:** master mute (default ON), alarm volume, ambient volume.
- **Accessibility:** color-blind palette (none/deuteranopia/protanopia/
  tritanopia — swaps `--alarm`/`--abnormal`/`--accent`), reduced-motion
  override.
- **Units:** metric / imperial (temp, weight).
- **Instructor:** passcode field, "Forget unlock", session timeout.

Persisted to `localStorage` (`ems.settings.v1`).

### Audio + haptics

`lib/audio.ts`: single `AudioContext`, lazy-started on first user gesture;
channels `alarm`, `intervention`, `ambient` with per-channel `GainNode`.
Default `masterMuted = true`. Alarm tones synthesized (no asset bundle).
Ambient ambulance hum: short loop decoded once. Haptics via
`navigator.vibrate` only on touch devices, gated by Settings.

### New files

```
src/ui/shell/
  AppShell.tsx          // grid + named slots
  TopBar.tsx            // brand + ScenarioPicker + RunStatePill + Clock + Conn + ⚙
  LeftRail.tsx          // collapsible w/ persistence
  EquipmentTray.tsx     // accordion section
  ActionLog.tsx         // accordion section
  SimClock.tsx          // mm:ss:ms tabular nums
  RunStatePill.tsx
  Slot.tsx              // typed named slots so slices land safely

src/ui/scenario/
  ScenarioPicker.tsx
  ScenarioPopover.tsx
  ScenarioRow.tsx
  ScenarioSwitchDialog.tsx
  useScenarios.ts

src/ui/instructor/
  InstructorDrawer.tsx
  InstructorRoute.tsx     // /instructor
  PauseResume.tsx
  TimeWarpControl.tsx     // segmented control
  RestartButton.tsx
  EventTimeline.tsx       // scrubber + chips
  PasscodeGate.tsx
  useRunControls.ts       // RPC + optimistic state

src/ui/settings/
  SettingsButton.tsx
  SettingsDialog.tsx
  sections/{Display,Audio,Accessibility,Units,Instructor}.tsx
  useSettings.ts

src/lib/
  audio.ts                // Web Audio singleton
  rpc.ts                  // POST helpers for run/scenario endpoints
  store.ts                // Zustand shared slices
```

`App.tsx` shrinks to ~20 lines:
```tsx
<AppShell
  top={<TopBar/>}
  left={<LeftRail/>}
  center={<SceneSlot frame={frame}/>}
  right={<MonitorSlot frame={frame}/>}
  bottom={<AlarmSlot/>}
/>
<SettingsDialog/>
```
plus `/instructor` route guard.

---

## Schedule (3 weeks)

### Week 1 — Foundations (parallelizable)

| Day | Work                                                                    |
|-----|-------------------------------------------------------------------------|
| 1   | Design-token swap; introduce Zustand; new `--alarm`/`--abnormal` split. |
| 1–2 | `AppShell` grid + slot contracts. `App.tsx` reduced to composition.     |
| 2–3 | `useFrameClock` rAF clock; `monitorStore` ring buffers.                 |
| 2–4 | Backend: `POST /api/actions` + `interventions` echo; `GET /api/scenarios` stub; `run_state` field. |
| 4–5 | `WaveformStrip` + ECG synth + pleth synth + capno synth (no monitor shell yet). Unit tests for synth fns. |

### Week 2 — Monitor + scene swap

| Day | Work                                                                    |
|-----|-------------------------------------------------------------------------|
| 1   | `MonitorShell` 2D + numeric tiles + trend strips. Replace `VitalsPanel`.|
| 1–2 | `AlarmBanner` + `alarms/rules.ts` + Web Audio tones + silence flow.     |
| 2   | `Monitor3D` rewired to read off-screen canvas from `MonitorShell`.      |
| 3–4 | `AmbulanceInterior` primitives + `InteriorLightRig` + camera retune.    |
| 4–5 | Patient GLB load, breathing morph, `patientMaterial` cyanosis uniform.  |
| 5   | License-review pass; `LICENSES.md`; CI bundle-size check.               |

### Week 3 — Interaction + polish

| Day | Work                                                                    |
|-----|-------------------------------------------------------------------------|
| 1–2 | Equipment models (primitives + defib GLB) + `PickableMesh` + outline.   |
| 2   | `useEquipmentInteraction` state machine + attach animation.             |
| 3   | `lib/actions.ts` (ULID, optimistic, dedupe) + wire to backend echo.     |
| 3–4 | Scenario popover + instructor drawer + `useRunControls`.                |
| 4   | Settings modal + audio toggle + color-blind palettes.                   |
| 5   | A11y audit (keyboard, screen reader, reduced motion, forced-colors).    |
| 5   | Perf audit: 60 fps target on Iris Xe; bundle ≤ 6 MB; recordings.        |

---

## Risks + open questions

- **Slot contracts** between slices land in week 1 (`Slot.tsx` typed
  props for `MonitorSlotProps`, `AlarmSlotProps`, `SceneSlotProps`) — this
  is the gate that lets four pieces land in parallel without merge churn.
- **License risk**: every Sketchfab model re-verified at fetch time;
  Quaternius CC0 is the safe path for the patient. Non-CC0 = unusable
  without legal sign-off.
- **GLB-doesn't-fit fallback**: `VITE_PATIENT_MODE=glb|primitive` keeps
  today's primitive patient as Suspense fallback + escape hatch.
- **Pulse-gated cues** (sweat, GCS, pupils, JVD) are reserved fields in
  the wire format but the UI feature-flags them off until Pulse FFI lands.
- **Action idempotency**: ULID + server-side dedupe window (~30 s);
  reconnect-while-pending must not double-apply.
- **Wire bloat**: don't push patient-state at 50 Hz — separate
  `PatientStateFrame` at 5 Hz with `last_changed_tick`.
- **AudioContext autoplay**: first start gated on the "Start scenario"
  click so unlock is invisible.
- **rectAreaLight gotcha**: needs `RectAreaLightUniformsLib.init()` once;
  put it in `InteriorLightRig.tsx` mount effect. Easy to forget → black
  light.
- **Picking on the breathing patient**: `<Bvh>` needs `firstHitOnly` and
  refit on morph change, OR use a low-poly invisible collider sibling
  (cheaper, recommended).
- **fps fallback if interior heavy**: drop `rectAreaLight` for
  `directionalLight` + baked AO; disable shadows on tris < 500;
  `dpr=[1, 1.5]` instead of `[1, 2]`.

---

## Files of interest (current state)

- `engine/web/src/App.tsx` — shell composition.
- `engine/web/src/styles.css` — token source.
- `engine/web/src/three/{Scene,Patient,Stretcher,Monitor3D}.tsx` — current
  3D primitives.
- `engine/web/src/ui/{VitalsPanel,ScenarioBadge,ConnectionStatus}.tsx` —
  current 2D UI.
- `engine/web/src/lib/stream.ts` — wire format mirror.
- `crates/sim-server/src/{wire,web}.rs` — backend wire + axum routes.
- `docs/SESSION_HANDOFF.md` — the deeper-fidelity track (Pulse FFI, gRPC,
  scenarios, replay). Both tracks share the `PhysiologyEngine` trait and
  the WebSocket seam.
