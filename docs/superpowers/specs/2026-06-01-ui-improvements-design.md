# UI Improvements — Onboarding, Scenario Picker Visibility, Direct 3D Interaction

**Date:** 2026-06-01
**Status:** Approved (design); pending implementation plan
**Scope:** Frontend only (`engine/web/`). No backend changes.

## Problem

The EMS Simulator web UI works end-to-end but has three gaps:

1. **No onboarding.** The app boots straight to a dense clinical shell. A
   first-time user has no idea they can orbit the 3D patient, click
   equipment, or read the monitor.
2. **Scenario picker is occluded.** The top-bar scenario picker popover is
   painted over by the 3D scene canvas, so the bottom of the list is
   unreachable.
3. **Shallow 3D interaction.** Only bench equipment is clickable. The
   patient, the in-scene monitor, and the camera offer no direct
   interaction.

## Hard constraints (apply to all three slices)

- **50 Hz rule.** The WS vitals feed must never drive React state. New
  features that need frame data read `useMonitorStore.getState().latest`
  imperatively inside event handlers or `useFrame` — never via a component
  subscription to the frame feed.
- **Honesty.** The backend is a fixed CSV `TraceReplayEngine`. Equipment
  actions are acknowledged and echoed in `VitalsFrame.interventions` but do
  **not** change vitals. Every new 3D readout therefore *derives from* the
  live vitals stream or is a clearly **labeled static exam note**. Nothing
  fabricates physiology.
- **No new npm dependencies.** Bundle size is a tracked quality bar (initial
  JS ~15 KB gz). Camera tweens use a `useFrame` lerp; drag uses raw R3F
  pointer events. No tween/gesture libraries.
- **A11y parity.** Every new 3D interaction keeps a DOM/keyboard equivalent,
  extending the existing `equipment-a11y` `<Html>` button pattern. The
  onboarding modal uses native `<dialog>` for free focus-trap + Esc.
- **Slot architecture.** New features live in their own modules/slots, not
  threaded through `AppShell` props.

## Architecture

```
ui/onboarding/            ← Slice 1 (new)
  OnboardingWizard.tsx       native <dialog>, 5 steps, Next/Back/Skip
  useOnboarding.ts           zustand + localStorage 'ems.onboarding.v1'
  steps.ts                   step content as pure data
styles.css                ← Slice 2 (one rule on .shell__top)
three/interaction/        ← Slice 3 (new 3D subsystem)
  assessment/
    hotspots.ts              region anchors + pure deriveFinding(frame)
    HotspotMarker.tsx        pulsing ring + <Html> a11y button
    AssessmentCallout.tsx    in-scene floating finding label
    assessmentStore.ts       capped append-only findings log (zustand)
  CameraRig.tsx              named presets + useFrame lerp controller
  useObjectTooltip.ts        hover→name layer (throttled, no per-frame state)
ui/scene/                 ← Slice 3 DOM overlays (new)
  CameraBar.tsx              bottom-center preset pill
  AssessmentLog.tsx          docked top-left findings panel
  ObjectTooltip.tsx          single DOM tooltip element
```

Touched existing files: `App.tsx`, `TopBar.tsx`, `Scene.tsx`, `SceneSlot.tsx`,
`three/equipment/PickableMesh.tsx`, `lib/actions.ts`, `three/equipment/registry.ts`.

---

## Slice 1 — Onboarding wizard

**New:** `ui/onboarding/{OnboardingWizard.tsx, useOnboarding.ts, steps.ts}`.
**Touched:** `App.tsx` (mount), `TopBar.tsx` (`?` Help button).

- **`steps.ts`** — pure data array `{ id, icon, title, body }[]`, 5 entries:
  Welcome, Vitals monitor, 3D patient & camera, Treat & assess, Scenario &
  help. Copy lives here, not in the component.
- **`useOnboarding.ts`** — zustand store with hand-rolled localStorage
  persistence mirroring `useSettings` (key `ems.onboarding.v1`, shape
  `{ completed: boolean }`). API: `isOpen`, `open()`, `close()`,
  `markCompleted()`, `reopen()`. Derived `shouldAutoOpen = !completed` read
  once on first import.
- **`OnboardingWizard.tsx`** — native `<dialog>` + `showModal()` (same
  scaffold as `SettingsDialog`: browser focus-trap, Esc, `::backdrop`
  scrim). Internal `stepIndex` state. Footer: Back (disabled at step 0) /
  Next → ("Start" on the last step → `markCompleted()` + close). Skip ✕ and
  a "Don't show again" checkbox both close + `markCompleted()`. Dot progress
  indicator. `aria-labelledby` the current step title; Arrow-Left/Right also
  navigate.
- **Trigger flow:** `App.tsx` reads `useOnboarding`; if `shouldAutoOpen`,
  the dialog opens on mount (first run only — flag absent). The `?` Help
  button in `TopBar` calls `reopen()`, which opens regardless of `completed`
  and does **not** clear the flag.
- **Reduced motion:** existing `--dur-*` tokens already zero out under
  `prefers-reduced-motion`, so step transitions won't animate.

**Tests:** `steps.test.ts` (every step has non-empty title/body, ids unique
& stable); `useOnboarding.test.ts` (first run auto-opens; `markCompleted`
persists to localStorage; `reopen` ignores the flag) via `getState()`.

---

## Slice 2 — Scenario picker visibility (CSS-only)

**Touched:** `styles.css` only. No JS/TSX change.

**Root cause:** `.shell__center` / `.scene` is `position:absolute; inset:0`
and a later grid sibling, so it paints over the picker popover where the
popover drops below the top-bar row. The popover's `z-index:50` is trapped
inside the top bar's local context, and `.shell__top` establishes no
stacking context of its own.

**Fix:** add to `.shell__top`:

```css
position: relative;
z-index: 10;
```

This lifts the top bar and any popover anchored in it above the scene cell.
Verify the drei `<Html>` equipment overlays keep `zIndexRange={[0, 0]}` so
they cannot escape above the top bar, and confirm the settings `<dialog>`
(renders in the top layer) is unaffected.

**Verification:** browser test (Playwright driving real Chrome) — open the
picker, assert the full list including bottom rows is visible and clickable
over the canvas; before/after screenshots. Presentational, so covered by
browser verification rather than a unit test.

**Out of scope (separate future task):** making scenario switching truly
functional. Only one scenario exists today and `/api/run/restart` 404s
(client-side fallback). Functional switching needs new physiology trace
fixtures + backend endpoints and is explicitly deferred.

---

## Slice 3 — Direct 3D interaction (all four features)

**New:** `three/interaction/` + `ui/scene/` overlays.
**Touched:** `Scene.tsx`, `SceneSlot.tsx`, `PickableMesh.tsx`,
`lib/actions.ts`, `registry.ts`.

### 3a — Assessment hotspots + findings

- **`hotspots.ts`** — region array `{ id, label, anchor:[x,y,z],
  kind:'derived'|'static', deriveFinding(frame) }`. Regions: chest, airway,
  carotid (neck), radial (wrist), pupils (eyes), skin.
- **`deriveFinding`** is a **pure function of a `VitalsFrame`** →
  `{ title, finding, detail }`. Examples:
  - radial → `${HR} bpm`, `spo2 < 0.90 ? 'weak/thready' : 'strong'`
  - chest → `RR === 0 ? 'no breath sounds — apneic' : 'breath sounds present, RR ${RR}'`
  - skin → `spo2 < 0.90 ? 'cyanotic, cool' : 'warm, dry'`
  - airway → derived from RR/ETCO₂ (patent vs no air movement)
- **Static exam notes:** `pupils` and `carotid` have no encoding in the
  trace. They render a fixed note (e.g. "equal, reactive (baseline)") with a
  subtle marker distinguishing it from live-derived findings. Kept for
  training realism; honest via the marker.
- **`HotspotMarker.tsx`** — pulsing ring at `anchor` (reuses the `HoverHalo`
  aesthetic) wrapped with an `<Html>` button for keyboard/SR (the
  `equipment-a11y` pattern). Click reads `useMonitorStore.getState().latest`,
  derives the finding, appends to the assessment store. Markers dim with
  camera distance so they stay subtle when zoomed out.
- **`assessmentStore.ts`** — zustand append-only log of
  `{ regionId, title, finding, detail, atSimTimeS }`, capped at the last 25.
  In-scene callout reads most-recent-per-region; the docked log reads all.
- **`AssessmentCallout.tsx`** — `<Html>` floating label at the region
  anchor; auto-fades after ~6 s (setTimeout, not rAF).
- **`ui/scene/AssessmentLog.tsx`** — DOM panel docked top-left of the scene;
  timestamped (sim time), scrollable. **Assessment findings only** — it does
  not log equipment apply/detach (those stay in the existing left-rail
  Action Log; no duplication).

### 3b — Equipment drag & detach

- Extend **`PickableMesh`** with optional pointer-drag: `onPointerDown`
  captures the pointer; `onPointerMove` past a small movement threshold
  projects the cursor onto a drag plane and moves a ghost; `onPointerUp`
  near the item's registered attach point fires the existing
  `apply_equipment` action, else snaps back. A click below threshold still
  applies (click and drag don't conflict).
- **Draggable only for items with a real patient attach point:** NRB, BVM,
  IV line, defib pads. **Bedside items** (drug box, O₂ tank, intubation kit)
  remain **click-only** — no drag, since they have nowhere to land.
- **Detach:** an attached item shows a small `✕` detach handle via its
  `<Html>` overlay. Clicking posts a new `remove_equipment` action type.
  The server doesn't implement it yet, so `actions.ts` reconciles it with
  the same optimistic model (client authoritative for attach/detach visual
  state, exactly like today) and the item tweens back to the bench.
- **A11y:** keyboard path stays click-to-apply / click-to-detach via the
  `<Html>` buttons. Drag is a mouse enhancement, never the only path.

### 3c — Camera presets

- **`CameraRig.tsx`** — named presets `{ airway, monitor, fullBody, reset }`,
  each `{ position, target }`. On select, lerp camera position +
  OrbitControls target over ~`--dur-3` via `useFrame`; cancel the tween on
  any user drag (manual orbit always wins).
- **Guard:** every preset's `position`/`target` must lie within the existing
  orbit min/max distance and the sealed-compartment bounds (the eye must stay
  inside the box — see `reference-3d-scene-camera` memory / prior camera
  bug). A unit test asserts this so the out-of-box bug can't reappear.
- **`ui/scene/CameraBar.tsx`** — bottom-center pill (Airway · Monitor · Full
  body · Reset), DOM overlay in `SceneSlot` near the "drag to orbit" hint.
  Real `<button>`s (keyboard-native).
- **Reduced motion:** presets jump-cut instead of lerping.

### 3d — Focusable monitor + tooltips

- Clicking `Monitor3D` triggers the `monitor` camera preset (reuses 3c).
- **`useObjectTooltip.ts`** — hover→name layer: pointer-over on a registered
  object sets `{ name, hint, screenXY }`; `ui/scene/ObjectTooltip.tsx`
  renders a single DOM tooltip. Names sourced from `registry.ts` (equipment)
  plus a small anatomy/monitor map. Throttled; no per-frame React state.

**Cross-cutting:** all new clickable 3D objects `stopPropagation` so
OrbitControls drag and object clicks don't fight (existing pattern).

**Tests:** `deriveFinding` per region (pure, table-driven over sample
frames); `assessmentStore` append/cap behavior; camera-preset bounds guard
test; `remove_equipment` optimistic reconcile added to `actions.test.ts`.

---

## Testing & quality bars

All existing bars must stay green: `cargo` bars unaffected (no Rust change);
`tsc -b` strict + `noUncheckedIndexedAccess`; `vitest run` (43 existing +
new tests); `vite build` within bundle budget (no new deps). Browser
verification (real Chrome) for the visual slices: onboarding first-run +
reopen, picker visibility, and each 3D interaction, with screenshots.

## Explicitly out of scope

- Functional scenario switching (new traces + backend `/api/run/*`).
- Any physiology response to interventions (backend FFI work).
- Graphics realism upgrades (textures, PBR, models) — noted as near-future
  by the requester; this work must not block or conflict with that.
