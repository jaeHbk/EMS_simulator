// A stylized primitive patient with live cue uniforms.
//
// Slice 1A keeps the geometry primitive (capsule torso, sphere head, NRB
// mask) and applies the cyanosis/pallor shader injection uniformly to all
// skin meshes. When slice 1B lands a real GLTF with a vertex-color
// cyanosis mask, the same uniforms will drive per-region tinting (lips,
// nail beds) instead of the whole mesh.
//
// Breath envelope: cos² with a 1:2 inhale/exhale split for a clinically
// truer chest rise than a bare sine.
//
// IMPORTANT: this component reads the latest frame imperatively from the
// monitor store inside useFrame. It does NOT take a `frame` prop because
// frame refs change on every WS message (50 Hz) — propagating the ref
// through props causes 50 Hz React renders. Reading from the store
// inside useFrame keeps the React tree quiet.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MeshStandardMaterial, type Mesh } from 'three';
import { updateCues, usePatientCues } from '../lib/usePatientCues';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';
import { injectPatientCues } from './cues/PatientCueShaders';

export function Patient() {
  const torsoRef = useRef<Mesh>(null);
  const phaseRef = useRef(0);
  const cues = usePatientCues();

  // One material per cue-tinted region (torso, head). We allocate once and
  // patch their shaders in a useEffect so injection happens on mount.
  const skinTorsoMat = useMemo(
    () => new MeshStandardMaterial({ color: '#d6dbe2', roughness: 0.55, metalness: 0.05 }),
    [],
  );
  const skinHeadMat = useMemo(
    () => new MeshStandardMaterial({ color: '#e7c8a8', roughness: 0.5, metalness: 0.05 }),
    [],
  );
  const skinArmMat = useMemo(
    () => new MeshStandardMaterial({ color: '#d6dbe2', roughness: 0.55 }),
    [],
  );

  useEffect(() => {
    injectPatientCues(skinTorsoMat, cues);
    injectPatientCues(skinHeadMat, cues);
    injectPatientCues(skinArmMat, cues);
  }, [cues, skinTorsoMat, skinHeadMat, skinArmMat]);

  // Pre-compute static geometry args to avoid re-allocating per frame.
  const torsoArgs = useMemo<[number, number, number, number]>(
    () => [0.22, 0.7, 8, 16],
    [],
  );
  const headArgs = useMemo<[number, number, number]>(() => [0.16, 24, 24], []);
  const armArgs = useMemo<[number, number, number, number]>(
    () => [0.07, 0.55, 6, 12],
    [],
  );

  useFrame((_, dt) => {
    const frame = useMonitorStore.getState().latest;
    updateCues(cues, frame);

    if (!torsoRef.current) return;
    const rr = frame?.respiratory_rate_bpm ?? 14;
    // Phase advances at the breath frequency.
    const omega = (rr / 60) * Math.PI * 2;
    phaseRef.current += omega * dt;
    // Map phase ∈ [0, 2π) into a 1:2 inhale/exhale envelope:
    //   inhale: rising cos² over the first 1/3 of the cycle
    //   exhale: descending cos² over the remaining 2/3
    // Result in [0, 1].
    const cyc = (phaseRef.current % (Math.PI * 2)) / (Math.PI * 2);
    const env =
      cyc < 1 / 3
        ? Math.sin((cyc / (1 / 3)) * (Math.PI / 2)) ** 2
        : Math.cos(((cyc - 1 / 3) / (2 / 3)) * (Math.PI / 2)) ** 2;
    // Amplitude vanishes near apnea (RR < 2). Cap so subtle.
    const amp = Math.min(1, Math.max(0, (rr - 1) / 6)) * 0.05;
    const s = 1 + env * amp;
    torsoRef.current.scale.set(s, 1, s);
  });

  // Mattress top sits at y ≈ 1.04 (frameY 0.86 + 0.06 + 0.04) — patient lays
  // along x axis, head at -x.
  const mattressTopY = 1.04;
  const torsoY = mattressTopY + 0.22;

  return (
    <group>
      {/* Torso */}
      <mesh
        ref={torsoRef}
        position={[0, torsoY, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinTorsoMat}
      >
        <capsuleGeometry args={torsoArgs} />
      </mesh>

      {/* Head */}
      <mesh position={[-0.7, torsoY + 0.04, 0]} castShadow material={skinHeadMat}>
        <sphereGeometry args={headArgs} />
      </mesh>

      {/* Arms */}
      <mesh
        position={[0.05, torsoY + 0.0, 0.28]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinArmMat}
      >
        <capsuleGeometry args={armArgs} />
      </mesh>
      <mesh
        position={[0.05, torsoY + 0.0, -0.28]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        material={skinArmMat}
      >
        <capsuleGeometry args={armArgs} />
      </mesh>

      {/* Non-rebreather mask hint over the face */}
      <mesh position={[-0.78, torsoY + 0.06, 0]} castShadow>
        <sphereGeometry args={[0.085, 16, 16]} />
        <meshStandardMaterial
          color="#cfe4ff"
          roughness={0.2}
          metalness={0.1}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  );
}
