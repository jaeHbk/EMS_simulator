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
 * - With `rrBpm` undefined, returns 1 (no breath modulation).
 * - At `phaseRad = 0` (mod 2π) with any rr, returns 1 (start of inhale).
 * - Inhale envelope is sin² of normalized phase across the first third
 *   of the cycle; exhale is cos² across the rest. So the curve rises
 *   smoothly to a peak around phase=π/3 and settles back to ~1 by 2π.
 * - Amplitude scales linearly with rr clamped to [1, 24] bpm.
 * - Negative phases wrap into [0, 2π) so callers can accumulate freely.
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

  // Find the chest mesh by traversing the scene. We look for the first
  // object whose name matches a chest convention. If the asset has no
  // such node we fall back to scaling the whole scene.
  useEffect(() => {
    let found: Object3D | null = null;
    scene.traverse((obj) => {
      if (found) return;
      const n = (obj.name ?? '').toLowerCase();
      if (n.includes('chest') || n.includes('torso') || n.includes('spine')) {
        found = obj;
      }
    });
    chestRef.current = found ?? scene;
  }, [scene]);

  // Bind cue shader to every MeshStandardMaterial in the scene tagged as
  // skin. Match by material name containing 'skin' or 'body'.
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial | MeshStandardMaterial[];
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const matName = (m.name ?? '').toLowerCase();
        if (
          m instanceof MeshStandardMaterial &&
          (matName.includes('skin') || matName.includes('body'))
        ) {
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
