# Visual Uplift v1 — Photoreal Patient + Tools, Walls Removed, HDRI Backdrop

**Date:** 2026-06-04
**Status:** approved (this doc)
**Scope:** frontend only (`engine/web/`). No backend changes.
**Branch:** `feat/ui-improvements` (each phase pushed to `origin/feat/ui-improvements` on completion)

## Problem

The 3D scene is functionally complete (interactions, hotspots, monitor, equipment registry, camera presets, alarms, demo mode) but visually reads as a stylized stick-figure mockup, not a real-world clinical environment. The user goal is "match real world" so a learner can open the app and immediately feel they are looking at an EMS scene. The two biggest current drags on realism are:

1. The patient is a stack of capsules and spheres, no PBR maps, no rig.
2. The compartment is rendered as flat-shaded boxes (walls, cabinets, windows, grab rails) which looks like a low-poly toy instead of a real space.

User-stated constraints (this session): **remove the walls, focus on patient/tools/visuals, prioritize a seamless "just play with it" experience.**

## Goal

When the user opens the app post-uplift, they see:

- A clinically-believable patient on a stretcher.
- Recognizable, textured PBR medical equipment (defibrillator, IV pole, oxygen tank, BVM, NRB mask, intubation kit, drug box, monitor housing) within reach.
- Professional lighting from an HDRI environment that also forms the visible background (no ambulance walls, no void).
- All current interactions still working: orbit camera, camera presets, click-to-focus monitor, click hotspots for assessment, click-and-drag equipment to apply / detach, action log, instructor controls.

## Non-goals

- No skinned animation rig beyond a chest-scale breathing tween (matches today's behavior).
- No new physiology, no new clinical content, no backend changes.
- No motion sickness from camera (keep tween eases identical to current).
- No mobile-specific tuning — desktop is the target as today.
- No multi-language asset metadata.
- No A/B-able visual options — we ship one clinical look.

## Hard constraints

| # | Constraint | Source |
|---|---|---|
| 1 | No new npm dependencies | `engine/web/CLAUDE.md` "Don't add npm dependencies" |
| 2 | Initial JS bundle ≤ ~17 KB gz | CLAUDE.md quality bar; assets must live in `public/`, not `import`-graph |
| 3 | 50 Hz rule preserved | CLAUDE.md "Frontend conventions" — patient breathing reads `useMonitorStore.getState().latest` inside `useFrame` only |
| 4 | All existing interactions work unchanged | Hotspots, equipment drag-to-apply, camera presets, monitor focus, tooltips |
| 5 | A11y parity preserved | Equipment `<Html>` button shadows + hotspot DOM buttons unchanged |
| 6 | `tsc -b` strict + `vitest run` ≥70 tests + `vite build` all green at every phase boundary | CLAUDE.md quality bars |
| 7 | `prefers-reduced-motion` respected | CLAUDE.md |
| 8 | All third-party assets CC0 or CC-BY with NOTICE.md attribution | License hygiene |

## Architecture

### File layout

```
engine/web/public/assets/                ← NEW: lazy-loaded blobs (vite copies to dist)
  patient/
    patient-supine.glb                   ~2–4 MB (CC0 / Quaternius or Sketchfab CC0)
    patient-supine.glb.LICENSE
  equipment/
    defibrillator.glb
    iv-pole.glb
    oxygen-tank.glb
    bvm.glb
    nrb-mask.glb
    intubation-kit.glb
    drug-box.glb
    monitor-bedside.glb
    *.LICENSE
  hdri/
    clinical-room-1k.hdr                 ~2–3 MB (Poly Haven CC0)
    clinical-room-1k.hdr.LICENSE
  NOTICE.md                              attribution roll-up

engine/web/src/three/
  Scene.tsx                              CHANGED: drop AmbulanceInterior + InteriorLightRig; add Environment + ContactShadows + Floor
  AmbulanceInterior.tsx                  DELETED
  lights/InteriorLightRig.tsx            DELETED (replaced by Environment IBL + one shadow caster)
  Patient.tsx                            CHANGED: useGLTF; chest-scale breathing animation kept; cue shader injection re-wired
  Stretcher.tsx                          UNCHANGED in Phase A; CHANGED in Phase C if a CC0 fits cleanly
  Monitor3D.tsx                          CHANGED in Phase C: housing GLB; canvas-rendered screen overlay unchanged
  equipment/Defibrillator.tsx            CHANGED in Phase A: useGLTF
  equipment/IvPole.tsx                   CHANGED in Phase A: useGLTF
  equipment/OxygenTank.tsx               CHANGED in Phase C: useGLTF
  equipment/Bvm.tsx                      CHANGED in Phase C: useGLTF
  equipment/NrbMask.tsx                  CHANGED in Phase C: useGLTF
  equipment/IntubationKit.tsx            CHANGED in Phase C: useGLTF
  equipment/DrugBox.tsx                  CHANGED in Phase C: useGLTF
  equipment/PickableMesh.tsx             UNCHANGED (raycast wrapper; GLB primitives still pickable)
  equipment/registry.ts                  UNCHANGED contract; only the renderer components inside swap
  interaction/orbitBounds.ts             CHANGED: bounds widened (no more "stay inside the box")
  interaction/CameraRig.tsx              UNCHANGED
  interaction/cameraPresets.ts           Light tweak: rear-doors preset reframed onto open floor

  lib/assetPaths.ts                      NEW: single source of truth for asset URLs + cache hints
  lib/useGltfWithFallback.ts             NEW: wrapper around drei useGLTF that returns a primitive cube if the GLB fails
```

### Lighting redesign

- `<Environment files="/assets/hdri/clinical-room-1k.hdr" background />` from drei.
  - **IBL:** replaces ambient + point + rectAreaLight from `InteriorLightRig.tsx`.
  - **Visible backdrop:** the same HDRI is the scene's `background`. Camera pans show the same environment, implying a stationary clinical room.
- One `<directionalLight castShadow>` remains (kept tight, 1024² shadow map per current perf budget) for ground shadow definition under the patient and equipment.
- `<ContactShadows>` under the stretcher gives the patient weight on the floor and prevents the "floating GLB" look.

### Camera bounds redesign

`orbitBounds.ts` was tuned to keep the camera *inside* the sealed compartment (z ∈ ±0.9 m, narrow polar). With walls gone:

- `minDistance` shrinks from current value → ~0.6 m (close inspection allowed).
- `maxDistance` grows modestly → ~3.5 m (room to step back without hitting a wall that no longer exists).
- Azimuth opens from a constrained arc to a near-360° pan (the patient can be circled).
- Polar angle window widens; floor is the only blocker. Top limit unchanged (no looking straight down).

Camera-preset poses (`cameraPresets.ts`) were chosen to *frame the patient* — they don't depend on walls. One preset (rear-doors view) is reframed because it was composed with the doors as a backdrop element.

### Asset loading discipline

- All asset blobs (GLB, HDR) live under `engine/web/public/assets/` and are never imported into the JS module graph. Vite copies `public/` verbatim to `dist/`.
- Each `useGLTF` call goes through `useGltfWithFallback(path)`. If the loader rejects (404, parse failure), the wrapper returns a primitive cube of the right approximate size; the scene never breaks.
- A single `useEffect` in `Scene.tsx` calls `useGLTF.preload()` for every asset path, so all GLBs warm in parallel from the moment the lazy 3D boundary mounts.
- `assetPaths.ts` exports an `ASSET_PATHS` const object — one record of every URL — so renaming a file is a one-line change. No string literals in component files.

### Asset sourcing

- **Patient (Phase B):** Quaternius free CC0 character pack OR Sketchfab CC0 medical-figure search. Required: supine pose OR riggable to supine with a baked-in idle. Approximately 2–4 MB after Draco compression. Plain hospital-gown texture or recolorable.
- **Equipment (Phases A and C):** Sketchfab CC0 medical-equipment search. Required: each item ≤ 1 MB after Draco. Topology clean enough to pick (simple convex hull preferred for raycasting; the wrapper handles complex meshes via the parent group).
- **HDRI (Phase A):** Poly Haven CC0 — search "hospital", "clinic", "operating room", "studio_small". 1k EXR/HDR (~2–3 MB).
- **Floor (Phase C):** Poly Haven CC0 PBR — concrete, epoxy, polished_concrete, or hospital_floor. Albedo + normal + roughness at 1k.

### Phasing

The user said `/loop until visuals match real world`. We ship in three independently-shippable phases. Each phase ends with: tests + tsc + build green, screenshot review, commit, push to `origin/feat/ui-improvements`.

#### Phase A — Foundation: walls off, HDRI on, two GLB equipment items

**What lands:**

- Delete `AmbulanceInterior.tsx` and `lights/InteriorLightRig.tsx`.
- Add `assetPaths.ts` + `useGltfWithFallback.ts`.
- Drop the chosen HDRI under `public/assets/hdri/`.
- Drop two equipment GLBs (defibrillator + IV pole) + their `.LICENSE` sidecars.
- `Scene.tsx` rewritten to use `<Environment background>`, `<ContactShadows>`, a single floor plane, one `<directionalLight castShadow>`.
- `Defibrillator.tsx` and `IvPole.tsx` swap to `useGltfWithFallback`.
- `orbitBounds.ts` widened.
- `NOTICE.md` created with attribution.

**Why this order:** the largest single perceptual shift ("walls gone, lighting looks like a real room") lands in <300 LOC and unblocks evaluation of the rest. If the HDRI choice is wrong we discover it before any patient or equipment work.

**Definition of done:**

- `tsc -b` clean, `vitest run` green, `vite build` green.
- Initial JS gz unchanged (HDRI + 2 GLBs are in `public/`, not the JS bundle).
- Screenshot review: HDRI clinical-room IBL on existing primitive patient + stretcher; defibrillator + IV pole render as PBR meshes; no walls.
- Commit pushed to `origin/feat/ui-improvements`.

#### Phase B — Patient model swap

**What lands:**

- Drop `patient-supine.glb` + `.LICENSE` under `public/assets/patient/`.
- `Patient.tsx` rewritten:
  - `useGltfWithFallback(ASSET_PATHS.patient)` provides the model.
  - Static GLB preferred. Breathing animation = scale tween on the chest mesh subtree (same approach as today; chest mesh ref points at the chosen GLB sub-node by name).
  - `injectPatientCues()` re-wired to the GLB's skin material (look up by material name; cue shader works on any `MeshStandardMaterial`).
  - Pulse oximeter and ECG dot overlays remain code-side meshes anchored to landmark world coords measured against the new model.
- `hotspots.ts` updated: each hotspot's anchor re-pinned to landmark coords on the new model. Phase A's measurement notes accompany this change.
- Cyanosis / pallor cue toggled in dev mode and visually verified.

**Why second:** with the final lighting from Phase A, we evaluate the patient GLB under production conditions from frame one. Avoids re-judging it under to-be-replaced lighting.

**Definition of done:**

- Patient is a recognizably human textured GLB.
- Breathing animation runs at the correct rate-from-vitals.
- All five existing patient hotspots place visibly on the right body region.
- Cyanosis cue still visible under desaturation.
- `tsc -b` / `vitest run` / `vite build` green.
- Commit pushed to `origin/feat/ui-improvements`.

#### Phase C — Equipment fleet, monitor housing, floor, polish

**What lands:**

- Drop GLBs for: BVM, NRB mask, intubation kit, drug box, oxygen tank, bedside monitor housing.
- Equipment components swap to `useGltfWithFallback`.
- `Monitor3D.tsx`: housing mesh swaps to GLB; canvas-rendered screen plane (current waveform overlay) unchanged.
- Floor swaps from flat painted plane to a textured PBR (concrete or epoxy) with normal + roughness maps.
- One subtle rim/key directional added to fill shadow detail behind the patient.

**Definition of done:**

- Every interactive item in the foreground frame is a textured PBR mesh — no stylized primitives in the click target set.
- Before/after screenshots show a clear visual delta vs Phase A.
- Existing equipment behavior unchanged (drag to apply, detach handle, hotkeys, action log).
- `tsc -b` / `vitest run` / `vite build` green.
- Commit pushed to `origin/feat/ui-improvements`.

## Failure modes

| Risk | Mitigation |
|---|---|
| HDRI pushes lazy load past acceptable | Use 1k HDRI (~2–3 MB), not 4k. `Environment` shows fallback gradient until loaded. `useEffect` preload runs concurrent with GLBs |
| Chosen patient GLB doesn't match clinical context | Phase A ships first standalone. Phase B's exit ramp: revert to primitive patient, ship Phases A + C only |
| Hotspot coordinates drift after model swap | Hotspot anchors move from raw world coords to landmark-relative coords measured during Phase B; structured table reviewed in plan |
| GLB licensing | NOTICE.md mandatory; only CC0 / Poly Haven / Quaternius / explicit CC-BY accepted; each asset has a `.LICENSE` sidecar |
| Initial JS bundle bloat | Asset blobs live in `public/`, never imported. Vite copies them as static files. Initial JS gz unchanged. Verified by inspecting `vite build` output before each phase commits |
| Performance regression on integrated GPUs | One directional shadow caster (already current); HDRI is sampled IBL not real-time GI; ContactShadows is one render. Should match or beat current rect-area-light + point + ambient setup |
| Existing 70+ tests rely on primitive geometry | Tests are unit/store-focused; no visual snapshots of 3D scene exist. `Patient.tsx` has no test file. Stretcher / equipment tests test behavior, not geometry. Spot-checked: nothing to break |
| User installs and a GLB URL 404s | `useGltfWithFallback` returns a primitive cube; scene keeps rendering; console error visible in dev |
| Skinned animation expected but GLB is static | Static GLB is the design default. Chest-scale breathing on a sub-node has no rig requirement. If a chosen asset is rigged, animation upgrade is a follow-on, not a blocker |

## Test plan (per-phase)

**Phase A:**
- `vitest run`: pre-existing tests stay green.
- New unit: `useGltfWithFallback.test.ts` — asserts (a) returns primitive cube node when path is a known-bad URL, (b) the wrapper does not call the loader twice for the same path under React StrictMode.
- Manual screenshot review against pre-Phase-A baseline.
- `vite build` output inspected for initial JS gz size — must be ≤ pre-Phase-A.

**Phase B:**
- New unit: `Patient.breathing.test.ts` — asserts the chest scale tween responds to a fed `respiratory_rate_bpm` value (mock store), at a tolerance that matches today's behavior.
- All five hotspot positions verified against a screenshot reference (manual).
- Cue shader cyanosis path tested by toggling SpO₂ low in demo mode.

**Phase C:**
- All equipment-action tests stay green (`actions.test.ts`).
- Drag-to-apply manually verified for each swapped item.
- Action log entries unchanged.

## Decision register

- **HDRI as both lighter and visible backdrop.** Cheapest path to "looks real," eye sees a believable space, single asset purchase. Alternatives (HDRI lighting + gradient bg, void + floor only) rejected — gradient under HDRI light reads uncanny, void cuts the EMS feel.
- **No new npm deps.** drei already exposes `Environment`, `useGLTF`, `useTexture`, `Stage`, `ContactShadows`. Three.js has GLTF/Draco loaders built in. Honors CLAUDE.md.
- **Asset blobs in `public/`.** Vite static-asset path keeps them off the JS bundle. `useGLTF` consumes them as URL strings.
- **Phasing in three independent ships.** Avoids a 1500-LOC patch where an early choice forces late rework. Each phase is independently shippable + visibly better.
- **Push per phase.** User explicitly asked. Each phase ends with `git push origin feat/ui-improvements`. No forced pushes.
- **`useGltfWithFallback`.** A 404 on any asset must not crash the scene. Wrapper returns a primitive cube of the right approximate size; the rest renders.
- **`assetPaths.ts` central registry.** One file controls every asset URL. Renaming = one-line change. Greps are findable.
- **Patient swap in Phase B, after lighting.** Evaluating the patient under production lighting from frame one.
- **Camera bounds widened, presets unchanged.** Presets frame the patient, not the walls. Only the orbit envelope needs to grow.
- **Solo-project workflow.** Branch `feat/ui-improvements` is current; no PR flow per the EMS_simulator workflow notes.

## Out of scope

- Skinned animation (rigged breathing, blinking, limb tremors).
- Custom-baked-from-photogrammetry assets.
- Particle / volumetric effects (smoke, oxygen mist, blood pooling).
- DOF / SSAO / bloom post-processing.
- Mobile-specific perf tuning.
- Multi-patient / scene composition.
- Real-time IBL probes / dynamic environment.
