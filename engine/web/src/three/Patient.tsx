// A stylized patient: capsule torso + sphere head + small arm capsules.
// The torso scales subtly to simulate breathing — amplitude proportional
// to the simulated respiratory rate. When RR drops to apnea the breathing
// motion stops, which is the clinical teaching point of the demo trace.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import type { VitalsFrame } from '../lib/stream';

interface Props {
  frame: VitalsFrame | null;
}

export function Patient({ frame }: Props) {
  const torsoRef = useRef<Mesh>(null);
  const phaseRef = useRef(0);

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
    if (!torsoRef.current) return;
    const rr = frame?.respiratory_rate_bpm ?? 14;
    // Breaths per second → angular phase advance.
    const omega = (rr / 60) * Math.PI * 2;
    phaseRef.current += omega * dt;
    // Amplitude vanishes near apnea (RR < 2).
    const amp = Math.min(1, Math.max(0, (rr - 1) / 6)) * 0.04;
    const s = 1 + Math.sin(phaseRef.current) * amp;
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
      >
        <capsuleGeometry args={torsoArgs} />
        <meshStandardMaterial color="#d6dbe2" roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Head */}
      <mesh position={[-0.7, torsoY + 0.04, 0]} castShadow>
        <sphereGeometry args={headArgs} />
        <meshStandardMaterial color="#e7c8a8" roughness={0.5} metalness={0.05} />
      </mesh>

      {/* Arms */}
      <mesh position={[0.05, torsoY + 0.0, 0.28]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={armArgs} />
        <meshStandardMaterial color="#d6dbe2" roughness={0.55} />
      </mesh>
      <mesh position={[0.05, torsoY + 0.0, -0.28]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={armArgs} />
        <meshStandardMaterial color="#d6dbe2" roughness={0.55} />
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
