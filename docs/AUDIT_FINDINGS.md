# Audit findings — 2026-05-20

End-of-week-3 a11y + perf audit. Two subagents read every file in the
refresh and reported issues; this is the closeout list. Items listed here
are the ones that were addressed in code; items still pending land at the
bottom and should be picked up during the visual-verification pass on a
real screen.

## Performance

### Closed (code-level fixes shipped)

- **50 Hz prop cascade.** `useVitalsStream` no longer drives React state
  for frames; it pushes directly to the monitor store. `App.tsx` keeps
  only `status` (low-frequency) in React state. `Patient`, `Monitor3D`,
  `SceneSlot`, `MonitorSlot`, `AlarmSlot`, `TopBar`, `SimClock` all
  dropped their `frame` prop and read from the store imperatively.
  Scene + 3D children no longer re-render at 50 Hz.
- **`useAlarms` selector.** The previous version subscribed to raw
  `latest`, re-rendering AlarmBanner on every WS message. Now selects
  derived `topPriority` so React renders only on band change.
- **`Monitor3D` history allocations.** `Array<number>.shift()` per frame
  reallocated internal storage. Replaced with a `Float32Array` ring +
  head index — write-in-place, zero allocations per frame. Texture
  upload throttled to 10 Hz.
- **Two shadow systems.** Dropped `<ContactShadows>` from `Scene.tsx` —
  the directional light's shadow map is sufficient. Reduced
  `shadow-mapSize` from 2048² → 1024² (4× less texel work).
- **Actions store unbounded growth.** Added a 60 s retention window in
  `actions.ts` `reconcile`; confirmed/rejected records older than the
  window are dropped. Pending records still age into rejected
  naturally.
- **EquipmentTray render-body mutation.** Moved `prevTargetRef` /
  `progressRef` reset out of the render body and into `useEffect` (was
  a React anti-pattern — render bodies must be pure).
- **`useReducedMotion` not subscribing.** Added a `MediaQueryList`
  listener so toggling the OS pref mid-session takes effect.
- **`useFrameRecorder` removed.** Dead code after the WS hook started
  pushing directly to the store.

### Pending (requires browser/profile to validate)

- **Draw-call count** estimated at ~80–100 (over the ~40 budget). To
  drop further: merge static cabinet/wall meshes into a single
  `BufferGeometry`; use `<instancedMesh>` for the four stretcher legs +
  four wheels, three cabinet handles, two windows, two rail posts.
  These are mechanical changes; pick them up if a real GPU profile
  shows fps shortfall.
- **CSS alarm flash animates `background-color`** (a paint property).
  An `opacity` overlay `::before` would composite-only. Defer until a
  measured paint-cost issue appears — current implementation already
  respects `prefers-reduced-motion` and the user-override toggle.
- **Vite manual chunks.** `@react-three/drei` + `@react-three/fiber`
  share the `fiber` chunk; per-named-import tree shaking would split
  unused drei pieces (e.g., `<Bvh>`, `<Environment>`) into a separate
  chunk. Today's bundle is well under target so it's not urgent.

## Accessibility

### Closed (code-level fixes shipped)

- **Keyboard equivalence for equipment picking** (the audit's biggest
  ship-blocker). `PickableMesh` now mounts a drei `<Html>` overlay
  carrying a real `<button>` with `aria-label`, `aria-pressed`,
  `disabled`. Tab-reachable, Space/Enter triggers the same `onPick`
  the mouse path uses.
- **`NumericTile` aria-live spam.** Removed `aria-live="polite"` from
  the value span (was being mutated 6×/s × 6 tiles → 36 announcements/s).
  Added `tabIndex={0}` + a band-aware `aria-label` so screen-reader
  users can probe a tile on demand. A new `<VitalsAnnouncer>` component
  (single `aria-live="polite"` region at MonitorShell scope) emits a
  plain-English summary every 10 s only when band-state has changed.
- **`ScenarioPicker` listbox structure.** Was `<button role="option">`
  inside a listbox (invalid ARIA). Now a true combobox-with-listbox:
  `<input role="combobox" aria-controls aria-activedescendant>` keeps
  focus while `<div role="option">` rows highlight. Outside-click +
  Esc both return focus to the trigger button. Active row is scrolled
  into view as the user arrows.
- **`InstructorDrawer` `aria-controls`** added so SR users know what's
  expanding.
- **Skip-link** added at the very top of `AppShell` jumping to
  `#scene-main` for keyboard users; visible on focus.
- **Right-rail duplicate landmark name** removed (the inner
  `<section aria-label="Patient monitor">` from MonitorShell carries the
  name; outer `<aside>` is unnamed).
- **`AlarmBanner` silence countdown** throttled from 1 Hz → 0.2 Hz so
  the silence-button `aria-label` doesn't re-announce every second.
- **`WaveformStrip`** marked `aria-hidden="true"` since the same data
  is conveyed in the numeric tiles.
- **`SettingsDialog` slider `aria-valuetext`** added so SR reads
  "55 percent" instead of "0.55".
- **Contrast bumps.** `--fg-mute` lifted from `#64748b` (4.4:1, fail)
  to `#7a8aa3` (5.5:1, pass AA Normal). `--alarm` lifted from
  `#ef4358` (borderline) to `#ff6b7a`; `--alarm-bg` darkened from
  `#2a0e15` to `#1a0509` for AA contrast on the surface.
- **`@media (forced-colors: active)`** block added — remaps tokens to
  system colors (`Highlight`, `CanvasText`, `GrayText`), draws explicit
  borders on every interactive surface, switches active states from
  fill to outline, keeps waveform canvas with `forced-color-adjust:
  none` so the synthesized signal is still visible. Disables flash
  animations entirely under forced-colors.
- **`.visually-hidden` utility** added for skip-link + announcer.

### Pending (best validated with a real screen reader)

- **NVDA/JAWS/VoiceOver verification.** Static audit covers ARIA
  correctness; only a real SR session will surface tone/cadence
  issues. Recommend Chrome + NVDA on Windows; Safari + VoiceOver on
  macOS.
- **High-contrast verification on Windows.** The `forced-colors` block
  is best-effort against the spec; Windows High Contrast mode varies
  across themes (Aquatic, Desert, Dusk) — verify each.
- **Color-blind palette** (`.cb-deut`, `.cb-prot`, `.cb-trit`) doesn't
  override `--alarm-bg`. Pending review of whether the dark red
  background is still readable when foreground is magenta/orange.
- **Window resize + reduced-motion** — verify the animations all
  honor the OS-level pref *and* the in-app override toggle, including
  the equipment snap-tween (already coded; visual confirm needed).

## Quality bars (final)

- `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test
  --workspace` — all clean. 22+ Rust tests including the WS smoke.
- `tsc -b` clean (TypeScript strict + `noUncheckedIndexedAccess`).
- `vitest run` — **43 tests across 8 files**, all pass.
- `vite build` — initial JS **13.32 KB gz**, well under 400 KB target.
  Three chunk lazy-loaded.
- Real `sim-server serve --static-dir engine/web/dist` returns the SPA,
  `/api/scenarios`, and accepts `POST /api/actions` end-to-end. Action
  echo round-trip ~700 ms.

## Files touched in this pass

- `engine/web/src/lib/stream.ts` — WS pushes to store, drops `frame`
  return.
- `engine/web/src/App.tsx`, `ui/shell/{AppShell,Slot,SceneSlot,
  MonitorSlot,AlarmSlot,TopBar,SimClock}.tsx` — drop `frame` prop
  cascade; skip-link.
- `engine/web/src/three/{Scene,Patient,Monitor3D}.tsx` — read store
  imperatively; ContactShadows removed.
- `engine/web/src/three/lights/InteriorLightRig.tsx` — shadow map
  1024².
- `engine/web/src/three/equipment/{PickableMesh,EquipmentTray}.tsx` —
  Html keyboard overlay; render-body mutation moved to effect;
  `useReducedMotion` subscribes.
- `engine/web/src/ui/monitor/{AlarmBanner,WaveformStrip,VitalsAnnouncer,
  MonitorShell,tiles/NumericTile,alarms/useAlarms}.tsx` — aria-live
  consolidation; selector fix.
- `engine/web/src/ui/scenario/ScenarioPicker.tsx` — combobox-listbox.
- `engine/web/src/ui/instructor/InstructorDrawer.tsx` — aria-controls.
- `engine/web/src/ui/settings/SettingsDialog.tsx` — slider
  aria-valuetext.
- `engine/web/src/lib/actions.ts` + `actions.test.ts` — retention
  window + tests.
- `engine/web/src/styles.css` — contrast bumps, forced-colors block,
  visually-hidden, equipment-a11y, skip-link, rm-override coverage.
- `engine/web/src/ui/monitor/hooks/useFrameRecorder.ts` — **deleted**
  (dead code).
