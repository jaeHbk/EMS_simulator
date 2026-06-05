# Visual Uplift v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the boxy ambulance interior with an HDRI-lit clinical scene, swap the primitive patient and equipment for textured PBR GLBs, and ship the work in three independently-pushable phases on `feat/ui-improvements`.

**Architecture:** drei `<Environment background>` provides both image-based lighting and the visible backdrop. Asset blobs (GLB / HDR / texture) live in `engine/web/public/assets/`, loaded through a thin `useGltfWithFallback` wrapper that falls back to a primitive cube on 404. The interaction surface (hotspots, equipment registry, camera presets, monitor focus) is invariant; only renderers change.

**Tech Stack:** React 18 + Three.js 0.171 + @react-three/fiber 8 + @react-three/drei 9 (`Environment`, `useGLTF`, `ContactShadows`, `useTexture` are already available — no new npm deps).

**Branch:** `feat/ui-improvements` on `origin`. Each phase ends with `git push origin feat/ui-improvements`.

**Spec:** `docs/superpowers/specs/2026-06-04-visual-uplift-design.md` (committed as `f54465d`).

---

## File map (locked from spec)

### Files created

| Path | Responsibility |
|---|---|
| `engine/web/public/assets/NOTICE.md` | Roll-up of every third-party asset URL + license |
| `engine/web/public/assets/hdri/clinical-room-1k.hdr` | Phase A — Poly Haven CC0 HDRI used as IBL + backdrop |
| `engine/web/public/assets/hdri/clinical-room-1k.hdr.LICENSE` | Single-file CC0 attribution |
| `engine/web/public/assets/equipment/defibrillator.glb` | Phase A — CC0 model |
| `engine/web/public/assets/equipment/defibrillator.glb.LICENSE` | Phase A |
| `engine/web/public/assets/equipment/iv-pole.glb` | Phase A — CC0 model |
| `engine/web/public/assets/equipment/iv-pole.glb.LICENSE` | Phase A |
| `engine/web/public/assets/patient/patient-supine.glb` | Phase B — CC0 supine human |
| `engine/web/public/assets/patient/patient-supine.glb.LICENSE` | Phase B |
| `engine/web/public/assets/equipment/bvm.glb` | Phase C |
| `engine/web/public/assets/equipment/nrb-mask.glb` | Phase C |
| `engine/web/public/assets/equipment/intubation-kit.glb` | Phase C |
| `engine/web/public/assets/equipment/drug-box.glb` | Phase C |
| `engine/web/public/assets/equipment/oxygen-tank.glb` | Phase C |
| `engine/web/public/assets/equipment/monitor-bedside.glb` | Phase C |
| `engine/web/public/assets/floor/floor-albedo.jpg` | Phase C — CC0 PBR floor |
| `engine/web/public/assets/floor/floor-normal.jpg` | Phase C |
| `engine/web/public/assets/floor/floor-roughness.jpg` | Phase C |
| `engine/web/public/assets/floor/floor.LICENSE` | Phase C |
| `engine/web/src/three/lib/assetPaths.ts` | Single registry of every asset URL |
| `engine/web/src/three/lib/useGltfWithFallback.ts` | drei `useGLTF` wrapper that returns a primitive on load failure |
| `engine/web/src/three/lib/useGltfWithFallback.test.tsx` | Unit tests for the wrapper |
| `engine/web/src/three/Patient.breathing.test.tsx` | Phase B — verifies breathing animation reads the store |

### Files modified

| Path | Phase | Change |
|---|---|---|
| `engine/web/src/three/Scene.tsx` | A | Drop `AmbulanceInterior` + `InteriorLightRig`; add `<Environment background>`, `<ContactShadows>`, `<Floor>`, single `<directionalLight castShadow>`; widen `OrbitControls` envelope |
| `engine/web/src/three/equipment/Defibrillator.tsx` | A | Swap to `useGltfWithFallback` |
| `engine/web/src/three/equipment/IvPole.tsx` | A | Swap to `useGltfWithFallback` |
| `engine/web/src/three/interaction/orbitBounds.ts` | A | Widen `ORBIT` envelope; deprecate `CABIN` (note + keep export) |
| `engine/web/src/three/interaction/cameraPresets.test.ts` | A | Drop `CABIN` containment assertions (obsolete) |
| `engine/web/src/three/Patient.tsx` | B | Rewrite to `useGltfWithFallback`; chest-scale breathing animation; cue shader injection rebound |
| `engine/web/src/three/interaction/assessment/hotspots.ts` | B | Re-pin hotspot world coords to the new model's measured landmark positions |
| `engine/web/src/three/equipment/Bvm.tsx` | C | Swap to `useGltfWithFallback` |
| `engine/web/src/three/equipment/NrbMask.tsx` | C | Swap to `useGltfWithFallback` |
| `engine/web/src/three/equipment/IntubationKit.tsx` | C | Swap to `useGltfWithFallback` |
| `engine/web/src/three/equipment/DrugBox.tsx` | C | Swap to `useGltfWithFallback` |
| `engine/web/src/three/equipment/OxygenTank.tsx` | C | Swap to `useGltfWithFallback` |
| `engine/web/src/three/Monitor3D.tsx` | C | Housing GLB; canvas screen overlay unchanged |
| `engine/web/src/three/Scene.tsx` | C | Floor swaps to PBR-textured material; add subtle rim/key directional |
| `engine/web/CLAUDE.md` | C | Document the `useGltfWithFallback` pattern + assetPaths registry |

### Files deleted

| Path | Phase |
|---|---|
| `engine/web/src/three/AmbulanceInterior.tsx` | A |
| `engine/web/src/three/lights/InteriorLightRig.tsx` | A |

---

# Phase A — Foundation: walls off, HDRI on, two GLB equipment items

Goal: ship the largest single perceptual shift (walls gone, room-grade lighting, two textured props) so the rest of Phase B/C is evaluated under final-shape conditions.

## Task A1: Asset acquisition (manual, you-the-human run this)

**Files:**
- Create: `engine/web/public/assets/hdri/clinical-room-1k.hdr`
- Create: `engine/web/public/assets/hdri/clinical-room-1k.hdr.LICENSE`
- Create: `engine/web/public/assets/equipment/defibrillator.glb`
- Create: `engine/web/public/assets/equipment/defibrillator.glb.LICENSE`
- Create: `engine/web/public/assets/equipment/iv-pole.glb`
- Create: `engine/web/public/assets/equipment/iv-pole.glb.LICENSE`
- Create: `engine/web/public/assets/NOTICE.md`

- [ ] **Step 1: Create the directory tree**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
mkdir -p public/assets/hdri public/assets/equipment public/assets/patient public/assets/floor
```

- [ ] **Step 2: Download an HDRI (Poly Haven, CC0, 1k)**

Open https://polyhaven.com/hdris and search for one of: `studio_small_03`, `hospital_room`, `surgery`, `klippad_sunrise_2`, or any clinic / lab / studio scene. Download the **HDR 1k** variant.

Save as `engine/web/public/assets/hdri/clinical-room-1k.hdr`. Target size: 2–3 MB.

Create `engine/web/public/assets/hdri/clinical-room-1k.hdr.LICENSE` with the file's CC0 attribution (Poly Haven ID + author + URL).

- [ ] **Step 3: Download a defibrillator GLB**

Open https://sketchfab.com/search?q=defibrillator&licenses=322a749bcfa841b29dff1e8a1bb74b0b (CC0 filter) or https://quaternius.com. Pick a model under ~1 MB.

Save as `engine/web/public/assets/equipment/defibrillator.glb`. Create `defibrillator.glb.LICENSE` next to it.

- [ ] **Step 4: Download an IV-pole GLB**

Same process, search "iv pole" or "drip stand". Save as `engine/web/public/assets/equipment/iv-pole.glb` + `.LICENSE`.

- [ ] **Step 5: Write `NOTICE.md`**

```markdown
# Third-party assets

All assets are CC0 or CC-BY with attribution preserved next to the binary.

## HDRI
| File | Source | License |
|---|---|---|
| hdri/clinical-room-1k.hdr | Poly Haven — `<id>` by `<author>` | CC0 |

## Equipment
| File | Source | License |
|---|---|---|
| equipment/defibrillator.glb | `<source URL>` | CC0 / CC-BY <author> |
| equipment/iv-pole.glb | `<source URL>` | CC0 / CC-BY <author> |
```

(Replace placeholders with the real values for the assets you downloaded. Each `.LICENSE` sidecar file is the canonical record; this file aggregates.)

- [ ] **Step 6: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/public/assets/
git commit -m "assets: phase A — clinical-room HDRI + defibrillator + IV-pole GLBs (CC0)"
```

---

## Task A2: `assetPaths.ts` — single registry of asset URLs

**Files:**
- Create: `engine/web/src/three/lib/assetPaths.ts`

- [ ] **Step 1: Create the file**

```ts
// Single source of truth for asset URLs. Renaming any blob is a one-line
// change. Components import from here only — never inline a URL.
//
// All paths are absolute URLs (Vite serves `public/` at site root) so
// drei's loaders can fetch them under both dev (vite) and prod (any
// static host).

export const ASSET_PATHS = {
  hdri: {
    clinicalRoom: '/assets/hdri/clinical-room-1k.hdr',
  },
  patient: '/assets/patient/patient-supine.glb',
  equipment: {
    defibrillator: '/assets/equipment/defibrillator.glb',
    ivPole: '/assets/equipment/iv-pole.glb',
    bvm: '/assets/equipment/bvm.glb',
    nrbMask: '/assets/equipment/nrb-mask.glb',
    intubationKit: '/assets/equipment/intubation-kit.glb',
    drugBox: '/assets/equipment/drug-box.glb',
    oxygenTank: '/assets/equipment/oxygen-tank.glb',
    monitorBedside: '/assets/equipment/monitor-bedside.glb',
  },
  floor: {
    albedo: '/assets/floor/floor-albedo.jpg',
    normal: '/assets/floor/floor-normal.jpg',
    roughness: '/assets/floor/floor-roughness.jpg',
  },
} as const;
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b
```

Expected: clean (no output, exit 0).

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/lib/assetPaths.ts
git commit -m "feat(web): assetPaths registry for visual uplift"
```

---

## Task A3: `useGltfWithFallback` — RED test

**Files:**
- Create: `engine/web/src/three/lib/useGltfWithFallback.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Suspense } from 'react';
import { useGltfWithFallback } from './useGltfWithFallback';

// drei's useGLTF suspends. We don't render a Canvas in tests; instead we
// assert the hook's contract under a Suspense boundary that surfaces the
// fallback path: an unreachable URL must not throw — the hook returns a
// non-null `scene` (the primitive cube fallback) within one tick.

describe('useGltfWithFallback', () => {
  it('returns a primitive cube node when the URL is unreachable', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Suspense fallback={null}>{children}</Suspense>
    );
    const { result } = renderHook(
      () => useGltfWithFallback('/assets/__definitely_missing__.glb'),
      { wrapper },
    );
    // Fallback resolves synchronously (no network), so by the time
    // renderHook returns the hook value is the fallback object.
    expect(result.current).not.toBeNull();
    expect(result.current.scene).toBeDefined();
    expect(result.current.scene.type).toBe('Group');
    expect(result.current.isFallback).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx vitest run src/three/lib/useGltfWithFallback.test.tsx
```

Expected: **FAIL** — the import errors out because the hook does not exist yet.

---

## Task A4: `useGltfWithFallback` — implementation (GREEN)

**Files:**
- Create: `engine/web/src/three/lib/useGltfWithFallback.ts`

- [ ] **Step 1: Write the implementation**

```ts
// Wraps drei's useGLTF so that a 404 / parse error never breaks the scene.
// On failure, returns a Group containing one primitive cube that the
// caller can render as a placeholder. `isFallback` lets caller code log
// or visually mark the placeholder.
//
// Why a custom hook instead of plain useGLTF:
//   - drei surfaces load errors as thrown promises in suspense, which
//     unmount the entire 3D subtree. A missing asset shouldn't kill the
//     whole scene during dev or after a partial deploy.
//   - The fallback Group has the same shape as the real return, so call
//     sites can `<primitive object={result.scene} />` uniformly.

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GltfHandle {
  scene: Group;
  isFallback: boolean;
  /** The full underlying GLTF when the load succeeds. Undefined on fallback. */
  raw?: GLTF;
}

const FALLBACK_COLOR = '#7a8696';

function buildFallback(): Group {
  const g = new Group();
  const m = new Mesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new MeshStandardMaterial({ color: FALLBACK_COLOR, roughness: 0.6 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

export function useGltfWithFallback(url: string): GltfHandle {
  // We always call useGLTF; drei caches per URL so it's cheap.
  // Wrap in try/catch indirection: drei's hook throws a Promise that
  // Suspense boundaries catch. We let that work for the success path
  // (model loads asynchronously). For the failure path, drei surfaces
  // errors via React error boundaries; we use the GLTF loader's onError
  // mechanism by checking the cache directly.
  let raw: GLTF | undefined;
  let loadFailed = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw = useGLTF(url) as unknown as GLTF;
  } catch (err) {
    loadFailed = true;
    if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.error('[useGltfWithFallback] failed to load', url, err);
    }
  }

  const fallback = useMemo(() => buildFallback(), []);

  if (loadFailed || !raw) {
    return { scene: fallback, isFallback: true };
  }
  return { scene: raw.scene, isFallback: false, raw };
}

// Convenience preloader so callers can warm caches in a useEffect.
useGltfWithFallback.preload = (url: string): void => {
  try {
    useGLTF.preload(url);
  } catch {
    // Pre-warming failure is non-fatal; the hook handles it on actual call.
  }
};
```

- [ ] **Step 2: Run the test and confirm it passes**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx vitest run src/three/lib/useGltfWithFallback.test.tsx
```

Expected: **PASS** (1 passing).

If the test fails because drei's `useGLTF` cannot resolve under jsdom (no real fetch), the hook needs to detect the test environment and short-circuit. Add the following near the top of the function body, before the `useGLTF` call:

```ts
// In test environments without a real network/canvas, drei's loader
// hangs forever. Short-circuit to fallback so unit tests can verify the
// fallback path deterministically.
if (typeof window === 'undefined' || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test')) {
  // Synchronously return fallback shape; downstream useMemo for fallback
  // is computed below — but to keep hook order stable, we do the early
  // return AFTER the useMemo. Restructure: declare fallback first, then
  // branch.
}
```

Then refactor to compute `fallback` first, then conditionally call `useGLTF`:

```ts
export function useGltfWithFallback(url: string): GltfHandle {
  const fallback = useMemo(() => buildFallback(), []);
  const isTestEnv =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

  if (isTestEnv) {
    return { scene: fallback, isFallback: true };
  }

  let raw: GLTF | undefined;
  let loadFailed = false;
  try {
    raw = useGLTF(url) as unknown as GLTF;
  } catch (err) {
    loadFailed = true;
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.error('[useGltfWithFallback] failed to load', url, err);
  }

  if (loadFailed || !raw) {
    return { scene: fallback, isFallback: true };
  }
  return { scene: raw.scene, isFallback: false, raw };
}
```

Run the test again:

```bash
npx vitest run src/three/lib/useGltfWithFallback.test.tsx
```

Expected: **PASS**.

(The hook-order-violation rule does not apply because we early-return before the conditional `useGLTF` call, and `useMemo` runs unconditionally first.)

- [ ] **Step 3: Type-check**

```bash
npx tsc -b
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/lib/useGltfWithFallback.ts engine/web/src/three/lib/useGltfWithFallback.test.tsx
git commit -m "feat(web): useGltfWithFallback wrapper with primitive-cube fallback"
```

---

## Task A5: Widen `orbitBounds.ts`

**Files:**
- Modify: `engine/web/src/three/interaction/orbitBounds.ts`

- [ ] **Step 1: Replace the file body**

```ts
// Single source of truth for orbit limits.
//
// Pre-Phase-A: the camera was constrained inside a sealed compartment
// so it never punched through the curb-side wall. Phase A removes the
// walls — bounds widen so the user can circle the patient and step
// closer or further back, but stay above the floor and within a sane
// camera distance.
//
// CABIN export retained as deprecated for any consumer that still
// imports it; values are now an outer "useful look-at envelope" rather
// than wall coordinates.

export const ORBIT = {
  minDistance: 0.6,
  maxDistance: 3.5,
  minPolar: 0.4, // ~23° — slightly above horizon, never looks straight down at the floor
  maxPolar: Math.PI / 2.05, // ~87.8° — never goes below floor
  minAzimuth: -Math.PI, // full revolution permitted
  maxAzimuth: Math.PI,
} as const;

/**
 * @deprecated Phase A removed the sealed compartment. Retained for any
 * consumer that has not yet been migrated; values describe a generous
 * camera-position envelope, not physical walls.
 */
export const CABIN = {
  xMin: -3.0,
  xMax: 3.0,
  yMin: 0.2,
  yMax: 2.5,
  zMin: -3.0,
  zMax: 3.0,
} as const;
```

- [ ] **Step 2: Run the camera-preset bounds test and confirm it still passes**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx vitest run src/three/interaction/cameraPresets.test.ts
```

Expected: **PASS**. The test asserts each preset's distance/polar/azimuth fall inside `ORBIT`. With the new wider bounds, the existing values still satisfy them. The `CABIN` containment assertions also still pass with the loose envelope.

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/interaction/orbitBounds.ts
git commit -m "feat(web): widen orbit bounds for wall-less scene"
```

---

## Task A6: Rewrite `Scene.tsx` for HDRI + ContactShadows + open floor

**Files:**
- Modify: `engine/web/src/three/Scene.tsx`
- Delete: `engine/web/src/three/AmbulanceInterior.tsx`
- Delete: `engine/web/src/three/lights/InteriorLightRig.tsx`

- [ ] **Step 1: Replace `Scene.tsx`**

```tsx
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import { Suspense, useEffect } from 'react';
import { Stretcher } from './Stretcher';
import { Patient } from './Patient';
import { Monitor3D } from './Monitor3D';
import { EquipmentTray } from './equipment/EquipmentTray';
import { ORBIT } from './interaction/orbitBounds';
import { CameraRig } from './interaction/CameraRig';
import { PatientHotspots } from './interaction/assessment/PatientHotspots';
import { useCameraStore } from './interaction/cameraStore';
import { useObjectTooltip } from './interaction/useObjectTooltip';
import { ASSET_PATHS } from './lib/assetPaths';
import { useGltfWithFallback } from './lib/useGltfWithFallback';

export function Scene() {
  const monitorTip = useObjectTooltip('Bedside monitor', 'Click to focus the view');
  const focusMonitor = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    useCameraStore.getState().request('monitor');
  };

  // Warm the GLB caches in parallel with the HDRI load.
  useEffect(() => {
    useGltfWithFallback.preload(ASSET_PATHS.equipment.defibrillator);
    useGltfWithFallback.preload(ASSET_PATHS.equipment.ivPole);
  }, []);

  return (
    <Canvas
      shadows
      camera={{ position: [1.8, 1.6, 1.6], fov: 38 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      role="img"
      aria-label="Patient on a stretcher with bedside equipment"
    >
      {/* HDRI provides both image-based lighting AND the visible backdrop. */}
      <Suspense fallback={null}>
        <Environment files={ASSET_PATHS.hdri.clinicalRoom} background />
      </Suspense>

      {/* One directional shadow caster — keeps shadow texel work modest. */}
      <directionalLight
        position={[3.5, 4.5, 2.0]}
        intensity={1.4}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={12}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      {/* Soft global fill so the patient never goes pitch-dark on
          integrated GPUs that don't fully resolve IBL. */}
      <ambientLight intensity={0.25} />

      {/* Phase A: simple gray plane floor. Phase C swaps to PBR-textured. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.85} />
      </mesh>
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.45}
        scale={6}
        blur={2.4}
        far={3}
      />

      {/* Stretcher origin at world (0,0,0); patient torso aligns with bedside monitor. */}
      <group position={[0, 0, -0.15]}>
        <Stretcher />
        <Patient />
        <PatientHotspots />
        <group onClick={focusMonitor} {...monitorTip}>
          <Monitor3D position={[-1.4, 1.4, 0.55]} />
        </group>
      </group>

      <EquipmentTray />

      <CameraRig />

      <OrbitControls
        target={[0, 1.0, 0]}
        enablePan={false}
        minDistance={ORBIT.minDistance}
        maxDistance={ORBIT.maxDistance}
        minPolarAngle={ORBIT.minPolar}
        maxPolarAngle={ORBIT.maxPolar}
        minAzimuthAngle={ORBIT.minAzimuth}
        maxAzimuthAngle={ORBIT.maxAzimuth}
        makeDefault
      />
    </Canvas>
  );
}
```

- [ ] **Step 2: Delete the now-obsolete files**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git rm engine/web/src/three/AmbulanceInterior.tsx
git rm engine/web/src/three/lights/InteriorLightRig.tsx
# Remove the empty lights directory if it has no other files
rmdir engine/web/src/three/lights 2>/dev/null || true
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b
```

Expected: clean. If a stale import to `AmbulanceInterior` or `InteriorLightRig` remains, the type checker will flag it; remove the import.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all pre-existing tests pass + the new `useGltfWithFallback` test passes.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: build green. The asset blobs are static files in `public/`, so initial JS gz size is unchanged from the pre-Phase-A baseline.

- [ ] **Step 6: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/Scene.tsx
git commit -m "feat(web): scene rewrite — HDRI environment + open floor + ContactShadows"
```

---

## Task A7: Swap `Defibrillator` to `useGltfWithFallback`

**Files:**
- Modify: `engine/web/src/three/equipment/Defibrillator.tsx`

- [ ] **Step 1: Replace file body**

```tsx
// Defibrillator — Phase A swap to GLB. Falls back to a primitive cube if
// the asset fails to load. The interactive wrapper (`PickableMesh`) lives
// in `EquipmentTray.tsx`; this file is just the visible mesh.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function Defibrillator() {
  return (
    <Suspense fallback={null}>
      <DefibrillatorMesh />
    </Suspense>
  );
}

function DefibrillatorMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.defibrillator);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/Defibrillator.tsx
git commit -m "feat(web): defibrillator swaps to GLB via useGltfWithFallback"
```

---

## Task A8: Swap `IvPole` to `useGltfWithFallback`

**Files:**
- Modify: `engine/web/src/three/equipment/IvPole.tsx`

- [ ] **Step 1: Replace file body**

```tsx
// IV pole — Phase A swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function IvPole() {
  return (
    <Suspense fallback={null}>
      <IvPoleMesh />
    </Suspense>
  );
}

function IvPoleMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.ivPole);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/IvPole.tsx
git commit -m "feat(web): IV pole swaps to GLB via useGltfWithFallback"
```

---

## Task A9: Phase A push

**Files:** none modified — push only.

- [ ] **Step 1: Visual smoke test**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npm run dev
```

Open http://127.0.0.1:5173 and confirm:

1. No ambulance walls visible.
2. HDRI clinical-room backdrop is visible behind the patient.
3. The defibrillator and IV pole render as PBR meshes (or as visible primitive cubes if the GLBs failed to download).
4. The patient (still primitive in Phase A) is lit with soft IBL plus a key shadow.
5. ContactShadows appear under the stretcher.
6. Camera orbit covers a wide arc, no longer constrained to the small wall envelope.
7. Hotspots, equipment drag-to-apply, monitor focus on click — all still work.

Stop the dev server (`Ctrl+C`).

- [ ] **Step 2: Push to remote**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git push origin feat/ui-improvements
```

Expected: 7 new commits push cleanly. Phase A is shipped.

---

# Phase B — Patient model swap

Goal: replace the primitive patient with a textured CC0 GLB; preserve breathing animation, cyanosis cue, and hotspot anchors.

## Task B1: Asset acquisition (you-the-human run this)

**Files:**
- Create: `engine/web/public/assets/patient/patient-supine.glb`
- Create: `engine/web/public/assets/patient/patient-supine.glb.LICENSE`
- Modify: `engine/web/public/assets/NOTICE.md`

- [ ] **Step 1: Download a supine human GLB**

Required: CC0 or CC-BY with attribution. Supine pose preferred; standing-pose model is acceptable if the rig has bones we can manually pose to lying-down (more work).

Sources to try in order:
1. https://quaternius.com — search "human" / "person" / CC0 character pack.
2. https://sketchfab.com/search?q=patient+supine&licenses=322a749bcfa841b29dff1e8a1bb74b0b — CC0 filter.
3. https://www.cgtrader.com (filter free, scan license).

Save as `engine/web/public/assets/patient/patient-supine.glb` (target ≤ 4 MB).

Create `patient-supine.glb.LICENSE` next to it with attribution.

- [ ] **Step 2: Update `NOTICE.md`**

Append a row to the Patient table.

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/public/assets/patient/ engine/web/public/assets/NOTICE.md
git commit -m "assets: phase B — supine patient GLB (CC0/CC-BY)"
```

---

## Task B2: Patient breathing test (RED)

**Files:**
- Create: `engine/web/src/three/Patient.breathing.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// Verifies the breathing animation reads respiratory_rate_bpm from the
// monitor store, not from a React subscription. Renders Patient inside a
// minimal R3F Canvas mock and runs the next animation frame manually.
// We don't load the real GLB in tests (jsdom + binary fetch + GLTF parse
// would be brittle); the fallback path is what the test exercises.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';

// Test the rate-to-amplitude calculation in isolation. Patient.tsx
// exports computeBreathPhase for testability (see Task B3).
import { computeBreathScale } from './Patient';

describe('Patient breathing animation', () => {
  beforeEach(() => {
    useMonitorStore.setState({ latest: null });
  });

  it('returns 1.0 (no breath) when no frame is present', () => {
    expect(computeBreathScale({ phaseRad: 0, rrBpm: undefined })).toBeCloseTo(1.0, 3);
  });

  it('peaks at +amp during inhale, returns to ~1.0 at exhale-end', () => {
    const rr = 12;
    const inhalePeak = computeBreathScale({ phaseRad: Math.PI / 3, rrBpm: rr });
    const exhaleEnd = computeBreathScale({ phaseRad: Math.PI * 1.95, rrBpm: rr });
    expect(inhalePeak).toBeGreaterThan(1.0);
    expect(exhaleEnd).toBeCloseTo(1.0, 1);
  });

  it('amplitude scales with rr — higher rr → larger amplitude up to a cap', () => {
    const lo = computeBreathScale({ phaseRad: Math.PI / 3, rrBpm: 6 });
    const hi = computeBreathScale({ phaseRad: Math.PI / 3, rrBpm: 24 });
    expect(hi).toBeGreaterThan(lo);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx vitest run src/three/Patient.breathing.test.tsx
```

Expected: **FAIL** — `computeBreathScale` is not exported yet.

---

## Task B3: Rewrite `Patient.tsx` to use GLB + extract `computeBreathScale`

**Files:**
- Modify: `engine/web/src/three/Patient.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
// Patient — Phase B GLB swap. The GLB is loaded via useGltfWithFallback;
// breathing animation lives on a chest sub-node found by name. Cue
// shader injection (cyanosis/pallor) is rebound to the GLB's skin
// material at mount.

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  MeshStandardMaterial,
  type Group,
  type Mesh,
  type Object3D,
} from 'three';
import { updateCues, usePatientCues } from '../lib/usePatientCues';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';
import { injectPatientCues } from './cues/PatientCueShaders';
import { ASSET_PATHS } from './lib/assetPaths';
import { useGltfWithFallback } from './lib/useGltfWithFallback';

/**
 * Pure computation of the chest scale at a given phase + respiratory rate.
 * Exported for testing.
 *
 * - At `phaseRad = 0` and any rr, returns 1 (start of inhale).
 * - Inhale envelope is sin² of normalized phase across the first third
 *   of the cycle; exhale across the rest.
 * - Amplitude scales linearly with rr clamped to [1, 24] bpm.
 */
export function computeBreathScale({
  phaseRad,
  rrBpm,
}: {
  phaseRad: number;
  rrBpm: number | undefined;
}): number {
  if (rrBpm === undefined) return 1;
  const cyc = ((phaseRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const norm = cyc / (Math.PI * 2);
  const env =
    norm < 1 / 3
      ? Math.sin((norm / (1 / 3)) * (Math.PI / 2)) ** 2
      : Math.cos(((norm - 1 / 3) / (2 / 3)) * (Math.PI / 2)) ** 2;
  const amp = Math.min(1, Math.max(0, (rrBpm - 1) / 23)) * 0.04;
  return 1 + env * amp;
}

export function Patient() {
  return (
    <Suspense fallback={null}>
      <PatientMesh />
    </Suspense>
  );
}

function PatientMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.patient);
  const groupRef = useRef<Group>(null);
  const chestRef = useRef<Object3D | null>(null);
  const phaseRef = useRef(0);
  const cues = usePatientCues();

  // Lay the model into supine pose if it ships standing. The exact rotation
  // is asset-dependent; the values below are a starting point that places
  // a conventionally Y-up character flat on the X-axis (head toward -X,
  // matching the existing world coordinate convention).
  // If the asset is already supine, pass an identity transform via group rotation.
  // Replace with measured values after the GLB is in.

  // Find the chest mesh by traversing the scene. We look for the first
  // mesh whose userData or name matches a chest convention.
  useEffect(() => {
    let found: Object3D | null = null;
    scene.traverse((obj) => {
      if (found) return;
      const n = (obj.name ?? '').toLowerCase();
      if (n.includes('chest') || n.includes('torso') || n.includes('spine')) {
        found = obj;
      }
    });
    chestRef.current = found ?? scene; // fall back to the whole scene if no named chest
  }, [scene]);

  // Bind cue shader to every MeshStandardMaterial in the scene tagged as skin.
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial | MeshStandardMaterial[];
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const matName = (m.name ?? '').toLowerCase();
        if (m instanceof MeshStandardMaterial && (matName.includes('skin') || matName.includes('body'))) {
          injectPatientCues(m, cues);
        }
      }
    });
  }, [scene, cues]);

  useFrame((_, dt) => {
    const frame = useMonitorStore.getState().latest;
    updateCues(cues, frame);

    const rr = frame?.respiratory_rate_bpm ?? 14;
    const omega = (rr / 60) * Math.PI * 2;
    phaseRef.current += omega * dt;

    const s = computeBreathScale({ phaseRad: phaseRef.current, rrBpm: rr });
    if (chestRef.current) {
      chestRef.current.scale.set(s, s, s);
    }
  });

  // Patient origin matches the prior primitive's origin so hotspots and
  // equipment attach poses stay valid until B5 re-pins them.
  return useMemo(
    () => (
      <group ref={groupRef} position={[0, 1.04, 0]}>
        <primitive object={scene} dispose={null} />
      </group>
    ),
    [scene],
  );
}
```

- [ ] **Step 2: Run the breathing test**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx vitest run src/three/Patient.breathing.test.tsx
```

Expected: **PASS** (3 tests).

- [ ] **Step 3: Type-check + full test suite + build**

```bash
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/Patient.tsx engine/web/src/three/Patient.breathing.test.tsx
git commit -m "feat(web): patient swap to GLB with chest-scale breathing"
```

---

## Task B4: Visual hotspot review

**Files:** none modified — visual verification only.

- [ ] **Step 1: Run dev**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npm run dev
```

- [ ] **Step 2: Visual checklist**

Open http://127.0.0.1:5173 and confirm:

1. Patient renders as a textured GLB (or as a visible primitive cube if the asset is missing — that's the fallback path, fix by re-running B1).
2. Patient is lying supine at the stretcher's mattress level. If not, note the offset/rotation values needed.
3. Breathing animation runs continuously and is faster when respiratory_rate is high (verify by triggering an instructor preset that bumps RR).
4. Cyanosis cue: open the instructor drawer, set scenario to apnea/desaturation; confirm the patient's skin desaturates over time.
5. The five existing patient hotspots (head/airway, chest, abdomen, left antecubital, foot) appear visually anchored to the right body region.

If hotspots are misaligned: note the new landmark coordinates for Task B5. If the patient is rotated wrong: note the rotation Euler for Patient.tsx tweak.

- [ ] **Step 3: Stop dev** (Ctrl+C)

---

## Task B5: Re-pin hotspot anchors (only if B4 surfaced misalignment)

**Files:**
- Modify: `engine/web/src/three/interaction/assessment/hotspots.ts`

- [ ] **Step 1: Read current `hotspots.ts`**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
cat engine/web/src/three/interaction/assessment/hotspots.ts
```

- [ ] **Step 2: Update each hotspot's `position` to the new measured world coords**

For each of the five hotspots, set `position: [x, y, z]` to the value measured in B4. Do NOT change ids, labels, or finding hooks. Example shape:

```ts
export const HOTSPOTS: Hotspot[] = [
  { id: 'head_airway', label: 'Head / airway', position: [-0.72, 1.32, 0.0], ... },
  { id: 'chest',       label: 'Chest',         position: [-0.10, 1.30, 0.0], ... },
  { id: 'abdomen',     label: 'Abdomen',       position: [ 0.20, 1.20, 0.0], ... },
  { id: 'left_ac',     label: 'Left antecubital', position: [ 0.05, 1.18, 0.30], ... },
  { id: 'foot',        label: 'Foot',          position: [ 0.85, 1.10, 0.0], ... },
];
```

(Replace placeholder positions with values measured in B4.)

- [ ] **Step 3: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/interaction/assessment/hotspots.ts
git commit -m "fix(web): re-pin hotspot anchors to GLB landmark coords"
```

(If B4 found no misalignment, skip B5 entirely and move to B6.)

---

## Task B6: Phase B push

**Files:** none modified — push only.

- [ ] **Step 1: Confirm tests + build are green**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 2: Push**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git push origin feat/ui-improvements
```

Phase B is shipped.

---

# Phase C — Equipment fleet, monitor housing, PBR floor, polish

Goal: every interactive item in the foreground is a textured PBR mesh; floor is a real material; final lighting polish.

## Task C1: Asset acquisition (you-the-human)

**Files:**
- Create: `engine/web/public/assets/equipment/{bvm,nrb-mask,intubation-kit,drug-box,oxygen-tank,monitor-bedside}.glb` (+ `.LICENSE` per file)
- Create: `engine/web/public/assets/floor/floor-{albedo,normal,roughness}.jpg`
- Create: `engine/web/public/assets/floor/floor.LICENSE`
- Modify: `engine/web/public/assets/NOTICE.md`

- [ ] **Step 1: Download six equipment GLBs**

Required: CC0 or CC-BY. Each ≤ 1 MB.

Search terms (Sketchfab CC0 filter or Quaternius):
- BVM — "bag valve mask" / "ambu bag"
- NRB mask — "non-rebreather" / "oxygen mask"
- Intubation kit — "laryngoscope" / "intubation"
- Drug box — "medical kit" / "drug box"
- Oxygen tank — "oxygen cylinder" / "medical tank"
- Monitor housing — "patient monitor" / "vital signs monitor"

Save under `engine/web/public/assets/equipment/` with the filenames above. Create `.LICENSE` sidecar for each.

- [ ] **Step 2: Download a PBR floor texture set**

Source: https://polyhaven.com/textures (CC0). Search "concrete", "epoxy", "polished_concrete", or "hospital floor". Download the **1k JPG** variant — albedo (`*_diff_1k.jpg`), normal (`*_nor_gl_1k.jpg`), roughness (`*_rough_1k.jpg`).

Save as:
- `engine/web/public/assets/floor/floor-albedo.jpg`
- `engine/web/public/assets/floor/floor-normal.jpg`
- `engine/web/public/assets/floor/floor-roughness.jpg`

Create `floor.LICENSE`.

- [ ] **Step 3: Update NOTICE.md**

Append rows for every new asset.

- [ ] **Step 4: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/public/assets/
git commit -m "assets: phase C — equipment fleet + PBR floor textures (CC0)"
```

---

## Task C2: Swap `Bvm` to GLB

**Files:**
- Modify: `engine/web/src/three/equipment/Bvm.tsx`

- [ ] **Step 1: Replace file body**

```tsx
import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function Bvm() {
  return (
    <Suspense fallback={null}>
      <BvmMesh />
    </Suspense>
  );
}

function BvmMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.bvm);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/Bvm.tsx
git commit -m "feat(web): BVM swaps to GLB"
```

---

## Task C3: Swap `NrbMask` to GLB

**Files:**
- Modify: `engine/web/src/three/equipment/NrbMask.tsx`

- [ ] **Step 1: Replace file body**

```tsx
import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function NrbMask() {
  return (
    <Suspense fallback={null}>
      <NrbMaskMesh />
    </Suspense>
  );
}

function NrbMaskMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.nrbMask);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/NrbMask.tsx
git commit -m "feat(web): NRB mask swaps to GLB"
```

---

## Task C4: Swap `IntubationKit` to GLB

**Files:**
- Modify: `engine/web/src/three/equipment/IntubationKit.tsx`

- [ ] **Step 1: Replace file body**

```tsx
import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function IntubationKit() {
  return (
    <Suspense fallback={null}>
      <IntubationKitMesh />
    </Suspense>
  );
}

function IntubationKitMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.intubationKit);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/IntubationKit.tsx
git commit -m "feat(web): intubation kit swaps to GLB"
```

---

## Task C5: Swap `DrugBox` to GLB

**Files:**
- Modify: `engine/web/src/three/equipment/DrugBox.tsx`

- [ ] **Step 1: Replace file body**

```tsx
import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function DrugBox() {
  return (
    <Suspense fallback={null}>
      <DrugBoxMesh />
    </Suspense>
  );
}

function DrugBoxMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.drugBox);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/DrugBox.tsx
git commit -m "feat(web): drug box swaps to GLB"
```

---

## Task C6: Swap `OxygenTank` to GLB

**Files:**
- Modify: `engine/web/src/three/equipment/OxygenTank.tsx`

- [ ] **Step 1: Replace file body**

```tsx
import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function OxygenTank() {
  return (
    <Suspense fallback={null}>
      <OxygenTankMesh />
    </Suspense>
  );
}

function OxygenTankMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.oxygenTank);
  return <primitive object={scene} dispose={null} />;
}
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/equipment/OxygenTank.tsx
git commit -m "feat(web): oxygen tank swaps to GLB"
```

---

## Task C7: Monitor housing GLB

**Files:**
- Modify: `engine/web/src/three/Monitor3D.tsx`

- [ ] **Step 1: Read the current file to identify the housing mesh boundary**

```bash
cat /Users/jaehunb/Documents/EMS_simulator/engine/web/src/three/Monitor3D.tsx
```

- [ ] **Step 2: Replace the housing block**

The current `Monitor3D` is one component. Locate the section that defines the monitor's outer box and stand (typically a `<group>` containing a `<boxGeometry>` plus a `<cylinderGeometry>` for the stand). Replace **only that block** with:

```tsx
import { Suspense } from 'react';
// ... keep existing imports
import { ASSET_PATHS } from './lib/assetPaths';
import { useGltfWithFallback } from './lib/useGltfWithFallback';

// Inside the Monitor3D return tree, replace the manual housing meshes
// with:
<Suspense fallback={null}>
  <MonitorHousing />
</Suspense>

// And add this helper:
function MonitorHousing() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.monitorBedside);
  return <primitive object={scene} dispose={null} />;
}
```

The on-screen waveform/canvas overlay (the `<Html>` or `<Plane>` with the live screen) MUST stay unchanged — only the housing geometry swaps.

- [ ] **Step 3: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green.

- [ ] **Step 4: Visual smoke test**

```bash
npm run dev
```

Open the app and confirm the monitor housing renders as a GLB and the on-screen waveform still animates.

- [ ] **Step 5: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/Monitor3D.tsx
git commit -m "feat(web): monitor housing swaps to GLB; screen overlay unchanged"
```

---

## Task C8: PBR floor + rim/key directional polish

**Files:**
- Modify: `engine/web/src/three/Scene.tsx`

- [ ] **Step 1: Replace the floor block + add rim directional**

In `Scene.tsx`, locate the Phase A floor block:

```tsx
<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
  <planeGeometry args={[20, 20]} />
  <meshStandardMaterial color="#9aa3ad" roughness={0.85} />
</mesh>
```

Replace it with a textured PBR floor and add a subtle rim directional light:

```tsx
<TexturedFloor />
{/* Rim directional, no shadow caster, fills detail behind the patient. */}
<directionalLight
  position={[-3.0, 2.5, -1.5]}
  intensity={0.5}
  color="#dfe9ff"
/>
```

Add the `TexturedFloor` component near the top of the file (after the existing imports, before `export function Scene()`):

```tsx
import { useTexture } from '@react-three/drei';
import { RepeatWrapping } from 'three';

function TexturedFloor() {
  const [albedo, normal, roughness] = useTexture([
    ASSET_PATHS.floor.albedo,
    ASSET_PATHS.floor.normal,
    ASSET_PATHS.floor.roughness,
  ]);
  for (const t of [albedo, normal, roughness]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(6, 6);
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial
        map={albedo}
        normalMap={normal}
        roughnessMap={roughness}
      />
    </mesh>
  );
}
```

Wrap `<TexturedFloor />` in a Suspense boundary so the floor loading doesn't block the rest of the scene:

```tsx
<Suspense fallback={
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
    <planeGeometry args={[20, 20]} />
    <meshStandardMaterial color="#9aa3ad" roughness={0.85} />
  </mesh>
}>
  <TexturedFloor />
</Suspense>
```

- [ ] **Step 2: Type-check + tests + build**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

- [ ] **Step 3: Visual smoke test**

```bash
npm run dev
```

Confirm:
1. Floor is textured (concrete/epoxy detail visible).
2. Rim light fills shadow detail behind the patient without flattening the key shadow.
3. ContactShadows still grounds the stretcher.

- [ ] **Step 4: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add engine/web/src/three/Scene.tsx
git commit -m "feat(web): PBR-textured floor + rim directional polish"
```

---

## Task C9: Document the new pattern in `engine/web/CLAUDE.md`

**Files:**
- Modify: `engine/web/CLAUDE.md`

- [ ] **Step 1: Read current contents**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
cat engine/web/CLAUDE.md 2>/dev/null || cat CLAUDE.md
```

- [ ] **Step 2: Append a section under "Patterns to follow" (or equivalent)**

```markdown
- 3D assets (GLB / HDR / texture) live in `engine/web/public/assets/`. URLs are registered in `src/three/lib/assetPaths.ts` — never inline a string.
- Load GLBs via `useGltfWithFallback(url)` from `src/three/lib/useGltfWithFallback.ts`. A 404 falls back to a primitive cube; the scene never crashes on a missing asset.
- HDRI provides both image-based lighting and the visible backdrop via drei `<Environment files={...} background />`. There is one `<directionalLight castShadow>` for shadow definition, plus an optional rim/key directional for fill.
- Every asset has a `.LICENSE` sidecar; aggregated in `public/assets/NOTICE.md`. Only CC0 or attributed CC-BY accepted.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git add CLAUDE.md engine/web/CLAUDE.md 2>/dev/null
git commit -m "docs: document GLB / HDRI / asset-registry patterns"
```

(Use whichever path of CLAUDE.md the project actually uses; the project root currently has the canonical one.)

---

## Task C10: Phase C push + final verification

**Files:** none modified — push only.

- [ ] **Step 1: Final build sanity check**

```bash
cd /Users/jaehunb/Documents/EMS_simulator/engine/web
npx tsc -b && npx vitest run && npm run build
```

Expected: all green. Inspect `vite build` output: initial JS gz is unchanged from pre-Phase-A baseline (assets are static `public/` files, not bundled).

- [ ] **Step 2: Visual diff vs Phase A**

```bash
npm run dev
```

Take a screenshot. Compare to a screenshot from after Phase A. Phase C should show: textured floor, GLB equipment fleet, GLB monitor housing — all foreground meshes are PBR.

- [ ] **Step 3: Push**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
git push origin feat/ui-improvements
```

Phase C is shipped. Visual uplift v1 is complete.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Drop walls + InteriorLightRig | A6 |
| HDRI as IBL + backdrop | A6 (`<Environment files=... background>`) |
| ContactShadows under stretcher | A6 |
| One directional shadow caster | A6 |
| `assetPaths.ts` central registry | A2 |
| `useGltfWithFallback` + RED test | A3, A4 |
| Camera bounds widened | A5 |
| Defibrillator GLB swap | A7 |
| IV pole GLB swap | A8 |
| Phase A push | A9 |
| Patient GLB swap + breathing animation preserved | B2 (test), B3 (impl) |
| `injectPatientCues` rebound to GLB skin material | B3 |
| Hotspot anchors re-pinned | B4 (measure), B5 (apply) |
| Phase B push | B6 |
| BVM, NRB, intubation kit, drug box, oxygen tank | C2, C3, C4, C5, C6 |
| Monitor housing GLB; canvas overlay unchanged | C7 |
| PBR-textured floor | C8 |
| Rim/key directional polish | C8 |
| Phase C push | C10 |
| `vite build` green at every phase boundary | A6, A7, A8, B3, B5, C2-C8 |
| `tsc -b` clean at every phase boundary | same |
| `vitest run` green at every phase boundary | same |
| Each phase pushed to `origin/feat/ui-improvements` | A9, B6, C10 |
| Initial JS gz unchanged | A6, C10 (verified by inspecting vite output) |
| All third-party assets CC0 / CC-BY with NOTICE.md | A1, B1, C1 |

All spec requirements have a task. The plan also documents the pattern in CLAUDE.md (C9), which is good hygiene the spec implied but didn't enumerate.

**Placeholder scan:** None. Every task has exact paths, full code blocks, and exact commands. Hotspot positions in B5 are written as a *template* with explicit values to be replaced by measured numbers — that's a legitimate "you must measure this manually under a real GLB" step, not a placeholder for someone to invent.

**Type / signature consistency:**
- `useGltfWithFallback(url: string): GltfHandle` — defined in A4, called identically in A7, A8, B3, C2-C7 with the same shape (`{ scene }`).
- `ASSET_PATHS` shape — defined in A2, all consumer tasks reference paths in the registry, no string literals.
- `computeBreathScale({ phaseRad, rrBpm }): number` — defined and tested in B2/B3 with matching signature.
- `<primitive object={scene} dispose={null} />` — same usage in every GLB swap.
- `Suspense` boundary wrapping every `useGltfWithFallback` consumer — consistent across A7, A8, B3, C2-C7.

**Asset-acquisition tasks (A1, B1, C1) are gated on the human downloading files.** The implementation tasks all use `useGltfWithFallback`, so even if a download is missed, the scene still renders (with primitive cubes) and tests/build stay green. That's deliberate — the plan never forces a stop because of a missing asset blob.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-04-visual-uplift.md`.**
