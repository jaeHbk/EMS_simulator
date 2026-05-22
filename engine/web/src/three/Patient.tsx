// Stylized patient with improved proportions, hospital gown, and live cue
// uniforms (cyanosis/pallor). Reads the monitor store imperatively in useFrame
// to avoid 50 Hz re-renders.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MeshStandardMaterial, type Mesh, type Group } from 'three';
import { updateCues, usePatientCues } from '../lib/usePatientCues';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';
import { injectPatientCues } from './cues/PatientCueShaders';

export function Patient() {
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
    const cyc = (phaseRef.current % (Math.PI * 2)) / (Math.PI * 2);
    const env =
      cyc < 1 / 3
        ? Math.sin((cyc / (1 / 3)) * (Math.PI / 2)) ** 2
        : Math.cos(((cyc - 1 / 3) / (2 / 3)) * (Math.PI / 2)) ** 2;
    const amp = Math.min(1, Math.max(0, (rr - 1) / 6)) * 0.04;
    const s = 1 + env * amp;
    chestRef.current.scale.set(s, 1, s);
    if (abdomenRef.current) {
      abdomenRef.current.scale.set(1, 1, 1 + env * amp * 0.5);
    }
  });

  const mattressTopY = 1.04;
  const torsoY = mattressTopY + 0.18;

  return (
    <group>
      {/* ─── Head + neck ─────────────────────────────────────── */}
      <group position={[-0.72, torsoY + 0.12, 0]}>
        {/* Skull */}
        <mesh castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.13, 24, 24]} />
        </mesh>
        {/* Hair cap */}
        <mesh position={[0, 0.04, 0]} castShadow material={hairMat}>
          <sphereGeometry args={[0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        {/* Ears */}
        <mesh position={[0, -0.02, 0.12]} castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
        <mesh position={[0, -0.02, -0.12]} castShadow material={skinFaceMat}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
        {/* Nose */}
        <mesh position={[0.02, -0.01, 0]} rotation={[0, 0, Math.PI / 6]} castShadow material={skinFaceMat}>
          <coneGeometry args={[0.025, 0.05, 8]} />
        </mesh>
        {/* Neck */}
        <mesh position={[0.15, -0.1, 0]} rotation={[0, 0, Math.PI / 12]} castShadow material={skinFaceMat}>
          <cylinderGeometry args={[0.06, 0.07, 0.12, 12]} />
        </mesh>
      </group>

      {/* ─── Chest (breathing mesh) ───────────────────────────── */}
      <mesh
        ref={chestRef}
        position={[-0.2, torsoY + 0.02, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <capsuleGeometry args={[0.19, 0.4, 8, 16]} />
        <meshStandardMaterial color="#6fa8c8" roughness={0.75} />
      </mesh>

      {/* ─── Abdomen ──────────────────────────────────────────── */}
      <group ref={abdomenRef}>
        <mesh position={[0.22, torsoY - 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.2, 0.28, 8, 16]} />
          <meshStandardMaterial color="#6fa8c8" roughness={0.75} />
        </mesh>
      </group>

      {/* ─── Gown drape (sheet over lower body) ───────────────── */}
      <mesh position={[0.55, torsoY - 0.06, 0]} castShadow>
        <boxGeometry args={[0.75, 0.06, 0.5]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.8} />
      </mesh>

      {/* ─── Legs (under sheet, subtle shape) ─────────────────── */}
      <mesh position={[0.65, torsoY - 0.1, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.08, 0.6, 6, 12]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.85} />
      </mesh>
      <mesh position={[0.65, torsoY - 0.1, -0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.08, 0.6, 6, 12]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.85} />
      </mesh>

      {/* ─── Arms (skin visible, at sides) ────────────────────── */}
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

      {/* ─── Hands ────────────────────────────────────────────── */}
      <mesh position={[0.28, torsoY - 0.08, 0.32]} castShadow material={skinMat}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>
      <mesh position={[0.28, torsoY - 0.08, -0.32]} castShadow material={skinMat}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>

      {/* ─── Pillow ───────────────────────────────────────────── */}
      <mesh position={[-0.72, mattressTopY + 0.04, 0]} castShadow>
        <boxGeometry args={[0.32, 0.08, 0.28]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.9} />
      </mesh>

      {/* ─── ECG lead wires (thin lines on chest) ─────────────── */}
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

      {/* ─── Pulse oximeter on finger ─────────────────────────── */}
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
