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

  const mattressTopY = 1.04;
  const torsoY = mattressTopY + 0.18;

  return (
    <group>
      {/* Head + neck */}
      <group position={[-0.72, torsoY + 0.12, 0]}>
        <mesh castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.13, 24, 24]} />
        </mesh>
        <mesh position={[0, 0.04, 0]} castShadow material={hairMat}>
          <sphereGeometry args={[0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        <mesh position={[0, -0.02, 0.12]} castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
        <mesh position={[0, -0.02, -0.12]} castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
        <mesh position={[0.02, -0.01, 0]} rotation={[0, 0, Math.PI / 6]} castShadow material={skinFaceMat}>
          <coneGeometry args={[0.025, 0.05, 8]} />
        </mesh>
        <mesh position={[0.15, -0.1, 0]} rotation={[0, 0, Math.PI / 12]} castShadow material={skinFaceMat}>
          <cylinderGeometry args={[0.06, 0.07, 0.12, 12]} />
        </mesh>
      </group>

      {/* Chest (breathing mesh) */}
      <mesh
        ref={chestRef}
        position={[-0.2, torsoY + 0.02, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <capsuleGeometry args={[0.19, 0.4, 8, 16]} />
        <meshStandardMaterial color="#6fa8c8" roughness={0.75} />
      </mesh>

      {/* Abdomen */}
      <group ref={abdomenRef}>
        <mesh position={[0.22, torsoY - 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.2, 0.28, 8, 16]} />
          <meshStandardMaterial color="#6fa8c8" roughness={0.75} />
        </mesh>
      </group>

      {/* Gown drape */}
      <mesh position={[0.55, torsoY - 0.06, 0]} castShadow>
        <boxGeometry args={[0.75, 0.06, 0.5]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.8} />
      </mesh>

      {/* Legs */}
      <mesh position={[0.65, torsoY - 0.1, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.08, 0.6, 6, 12]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.85} />
      </mesh>
      <mesh position={[0.65, torsoY - 0.1, -0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.08, 0.6, 6, 12]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.85} />
      </mesh>

      {/* Arms */}
      <mesh
        position={[-0.05, torsoY - 0.06, 0.3]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinMat}
      >
        <capsuleGeometry args={[0.05, 0.52, 6, 12]} />
      </mesh>
      <mesh
        position={[-0.05, torsoY - 0.06, -0.3]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinMat}
      >
        <capsuleGeometry args={[0.05, 0.52, 6, 12]} />
      </mesh>

      {/* Hands */}
      <mesh position={[0.28, torsoY - 0.08, 0.32]} castShadow material={skinMat}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>
      <mesh position={[0.28, torsoY - 0.08, -0.32]} castShadow material={skinMat}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>

      {/* Pillow */}
      <mesh position={[-0.72, mattressTopY + 0.04, 0]} castShadow>
        <boxGeometry args={[0.32, 0.08, 0.28]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.9} />
      </mesh>

      {/* ECG leads */}
      <mesh position={[-0.3, torsoY + 0.14, 0.08]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[-0.3, torsoY + 0.14, -0.08]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[-0.1, torsoY + 0.14, 0.12]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#e33" />
      </mesh>

      {/* Pulse oximeter on finger */}
      <mesh position={[0.28, torsoY - 0.07, 0.33]}>
        <boxGeometry args={[0.03, 0.02, 0.025]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[0.28, torsoY - 0.06, 0.33]}>
        <boxGeometry args={[0.015, 0.008, 0.012]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}
