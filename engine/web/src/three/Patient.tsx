// Patient renderer.
//
// Two paths:
//  1. Procedural — stylized stack of capsules / spheres with a hospital
//     gown, breathing chest, ECG leads, pulse-ox finger probe. This is
//     the default when no GLB asset is present (the common case until
//     someone drops a CC0 model into public/assets/patient/).
//  2. GLB — real patient model loaded via useGltfWithFallback once the
//     asset manifest confirms the file is present. Breathing scales a
//     chest sub-node found by name; cyanosis cue is rebound to any
//     skin/body MeshStandardMaterial in the scene.
//
// Both paths share `computeBreathScale` so the breathing curve is
// identical regardless of which model is rendering. Both read the
// monitor store imperatively in useFrame to avoid 50 Hz re-renders.

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
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
import { useAssetPresence } from './lib/assetManifest';

/**
 * Pure computation of the chest scale at a given phase + respiratory rate.
 * Exported for testing.
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
  const glbPresent = useAssetPresence(ASSET_PATHS.patient);
  if (!glbPresent) return <ProceduralPatient />;
  return (
    <Suspense fallback={<ProceduralPatient />}>
      <GlbPatient />
    </Suspense>
  );
}

// ─── GLB path ─────────────────────────────────────────────────────────

function GlbPatient() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.patient);
  const groupRef = useRef<Group>(null);
  const chestRef = useRef<Object3D | null>(null);
  const phaseRef = useRef(0);
  const cues = usePatientCues();

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

  return useMemo(
    () => (
      <group ref={groupRef} position={[0, 1.04, 0]}>
        <primitive object={scene} dispose={null} />
      </group>
    ),
    [scene],
  );
}

// ─── Procedural path ──────────────────────────────────────────────────

function ProceduralPatient() {
  const chestRef = useRef<Mesh>(null);
  const abdomenRef = useRef<Group>(null);
  const phaseRef = useRef(0);
  const cues = usePatientCues();

  const skinMat = useMemo(
    () => new MeshStandardMaterial({ color: '#e2b99a', roughness: 0.55, metalness: 0.02 }),
    [],
  );
  const skinFaceMat = useMemo(
    () => new MeshStandardMaterial({ color: '#e7c8a8', roughness: 0.5, metalness: 0.02 }),
    [],
  );
  const hairMat = useMemo(
    () => new MeshStandardMaterial({ color: '#3d2b1f', roughness: 0.9 }),
    [],
  );

  useEffect(() => {
    injectPatientCues(skinMat, cues);
    injectPatientCues(skinFaceMat, cues);
  }, [cues, skinMat, skinFaceMat]);

  useFrame((_, dt) => {
    const frame = useMonitorStore.getState().latest;
    updateCues(cues, frame);

    if (!chestRef.current) return;
    const rr = frame?.respiratory_rate_bpm ?? 14;
    const omega = (rr / 60) * Math.PI * 2;
    phaseRef.current += omega * dt;
    const s = computeBreathScale({ phaseRad: phaseRef.current, rrBpm: rr });
    chestRef.current.scale.set(s, 1, s);
    if (abdomenRef.current) {
      const sa = 1 + (s - 1) * 0.5;
      abdomenRef.current.scale.set(1, 1, sa);
    }
  });

  // Mattress top (matches Stretcher.tsx mattressY = 0.92, plus a small
  // indent so the back of the body rests *on* the mattress rather than
  // hovering above it). Body landmarks (head/chest/abdomen/feet) are
  // expressed relative to bodyY — the centerline of the supine torso.
  const mattressTopY = 0.96;
  // Half-thickness of the torso (chest capsule radius). Body centerline
  // sits one capsule-radius above the mattress so the back skin lies on it.
  const bodyY = mattressTopY + 0.16;

  return (
    <group>
      {/* Head + neck.
          Skull centered at x=-0.65 so that the crown is at x≈-0.75 (within
          0.15m of the legacy head landmark at -0.72). */}
      <group position={[-0.65, bodyY, 0]}>
        {/* Skull */}
        <mesh castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.1, 24, 24]} />
        </mesh>
        {/* Hair cap */}
        <mesh position={[-0.01, 0.03, 0]} castShadow material={hairMat}>
          <sphereGeometry args={[0.095, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        {/* Ears */}
        <mesh position={[0, -0.01, 0.095]} castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.025, 8, 8]} />
        </mesh>
        <mesh position={[0, -0.01, -0.095]} castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.025, 8, 8]} />
        </mesh>
        {/* Nose (points up toward +x, i.e. away from feet). For supine
            patient lying with head at -X, +X is "down" the body. The nose
            should point up (+Y). */}
        <mesh position={[0.04, 0.04, 0]} castShadow material={skinFaceMat}>
          <coneGeometry args={[0.018, 0.04, 8]} />
        </mesh>
        {/* Neck — short cylinder linking skull to chest along the body
            axis (X). Length 0.08, radius 0.05. */}
        <mesh
          position={[0.12, -0.02, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          material={skinFaceMat}
        >
          <cylinderGeometry args={[0.05, 0.055, 0.08, 12]} />
        </mesh>
      </group>

      {/* Chest (breathing mesh).
          Capsule lies along world-X (head→foot). Radius 0.16, length 0.32.
          Centered at x=-0.15. */}
      <mesh
        ref={chestRef}
        position={[-0.15, bodyY, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <capsuleGeometry args={[0.16, 0.32, 8, 16]} />
        <meshStandardMaterial color="#6fa8c8" roughness={0.75} />
      </mesh>

      {/* Abdomen — slightly slimmer capsule, centered at x=+0.15. */}
      <group ref={abdomenRef}>
        <mesh
          position={[0.15, bodyY, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <capsuleGeometry args={[0.16, 0.2, 8, 16]} />
          <meshStandardMaterial color="#6fa8c8" roughness={0.75} />
        </mesh>
      </group>

      {/* Sheet drape over the hips/upper legs, with a slight rounded
          "fold" suggested by RoundedBox. Centered at x=+0.45 (above the
          legs) at hip-fold height. */}
      <RoundedBox
        args={[0.85, 0.06, 0.55]}
        radius={0.025}
        smoothness={2}
        position={[0.45, bodyY + 0.16, 0]}
        castShadow
      >
        <meshStandardMaterial color="#e8e8e8" roughness={0.85} />
      </RoundedBox>

      {/* Legs — capsules along world-X, centered ~at x=+0.6 so they span
          from the hips (≈+0.30) to the feet (≈+0.95). Spaced ±0.12 in z
          for ~24cm center-to-center. */}
      <mesh
        position={[0.6, bodyY - 0.08, 0.12]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <capsuleGeometry args={[0.075, 0.7, 6, 12]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.85} />
      </mesh>
      <mesh
        position={[0.6, bodyY - 0.08, -0.12]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <capsuleGeometry args={[0.075, 0.7, 6, 12]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.85} />
      </mesh>

      {/* Arms — lying alongside the body at z=±0.20 (just outside the
          torso radius of 0.16). Same Y as torso. Capsule length 0.50. */}
      <mesh
        position={[0.0, bodyY, 0.2]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinMat}
      >
        <capsuleGeometry args={[0.05, 0.5, 6, 12]} />
      </mesh>
      <mesh
        position={[0.0, bodyY, -0.2]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinMat}
      >
        <capsuleGeometry args={[0.05, 0.5, 6, 12]} />
      </mesh>

      {/* Hands — at the foot-end of each arm capsule.
          Arm capsule center 0.0 + half-length 0.25 + cap radius 0.05 ≈ 0.30.
          Place hands at x=+0.30, slightly inset in z so they touch the body. */}
      <mesh position={[0.3, bodyY, 0.2]} castShadow material={skinMat}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>
      <mesh position={[0.3, bodyY, -0.2]} castShadow material={skinMat}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>

      {/* Pillow — behind the head, sitting on the mattress. */}
      <mesh position={[-0.78, mattressTopY + 0.025, 0]} castShadow>
        <boxGeometry args={[0.32, 0.05, 0.28]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.9} />
      </mesh>

      {/* ECG leads — small dots on the chest surface (top of the chest
          capsule is at bodyY + 0.16; place dots just above). */}
      <mesh position={[-0.25, bodyY + 0.16, 0.08]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[-0.25, bodyY + 0.16, -0.08]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[-0.05, bodyY + 0.16, 0.1]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color="#e33" />
      </mesh>

      {/* Pulse oximeter on finger (right hand at z=+0.20). */}
      <mesh position={[0.27, bodyY + 0.02, 0.2]}>
        <boxGeometry args={[0.03, 0.02, 0.025]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[0.27, bodyY + 0.03, 0.2]}>
        <boxGeometry args={[0.015, 0.008, 0.012]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}
