// Stryker-style ambulance stretcher: aluminium frame with scissor legs,
// caster wheels, side rails, dark mattress pad, and an adjustable-angle
// head section (fixed upright ~15°).

import { memo } from 'react';

const METAL = { color: '#c0c8d4', metalness: 0.7, roughness: 0.25 };
const DARK_METAL = { color: '#2a3444', metalness: 0.5, roughness: 0.35 };
const MATTRESS = { color: '#1a2230', roughness: 0.85 };
const WHEEL = { color: '#0e131c', roughness: 0.8, metalness: 0.1 };

const Stretcher = memo(function Stretcher() {
  const frameY = 0.86;
  const mattressY = frameY + 0.06;
  const railH = 0.22;

  return (
    <group>
      {/* ─── Main frame rails (two side bars + cross braces) ──── */}
      <mesh position={[0, frameY, 0.38]} castShadow>
        <boxGeometry args={[2.1, 0.04, 0.04]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, frameY, -0.38]} castShadow>
        <boxGeometry args={[2.1, 0.04, 0.04]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* Cross braces */}
      {[-0.7, 0, 0.7].map((x) => (
        <mesh key={x} position={[x, frameY, 0]} castShadow>
          <boxGeometry args={[0.03, 0.03, 0.72]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}

      {/* ─── Scissor-style legs (X-shaped from the side) ────────── */}
      {[-0.7, 0.7].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0.08, 0.44, 0.32]} rotation={[0, 0, 0.15]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.84, 8]} />
            <meshStandardMaterial {...DARK_METAL} />
          </mesh>
          <mesh position={[-0.08, 0.44, 0.32]} rotation={[0, 0, -0.15]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.84, 8]} />
            <meshStandardMaterial {...DARK_METAL} />
          </mesh>
          <mesh position={[0.08, 0.44, -0.32]} rotation={[0, 0, 0.15]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.84, 8]} />
            <meshStandardMaterial {...DARK_METAL} />
          </mesh>
          <mesh position={[-0.08, 0.44, -0.32]} rotation={[0, 0, -0.15]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.84, 8]} />
            <meshStandardMaterial {...DARK_METAL} />
          </mesh>
        </group>
      ))}

      {/* ─── Caster wheels (4 corners) ──────────────────────────── */}
      {[
        [-0.85, 0.36], [0.85, 0.36],
        [-0.85, -0.36], [0.85, -0.36],
      ].map(([x, z], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.065, 0.065, 0.04, 16]} />
            <meshStandardMaterial {...WHEEL} />
          </mesh>
          {/* Caster fork */}
          <mesh position={[0, 0.11, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      ))}

      {/* ─── Side rails (fold-down style, shown up) ─────────────── */}
      <mesh position={[-0.2, mattressY + railH / 2 + 0.04, 0.4]} castShadow>
        <boxGeometry args={[1.2, railH, 0.02]} />
        <meshStandardMaterial {...METAL} opacity={0.4} transparent />
      </mesh>
      <mesh position={[-0.2, mattressY + railH / 2 + 0.04, -0.4]} castShadow>
        <boxGeometry args={[1.2, railH, 0.02]} />
        <meshStandardMaterial {...METAL} opacity={0.4} transparent />
      </mesh>
      {/* Rail top bars */}
      <mesh position={[-0.2, mattressY + railH + 0.04, 0.4]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.2, 8]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[-0.2, mattressY + railH + 0.04, -0.4]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.2, 8]} />
        <meshStandardMaterial {...METAL} />
      </mesh>

      {/* ─── Mattress pad (dark blue/grey, slightly rounded look) ─ */}
      <mesh position={[0.05, mattressY, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.08, 0.7]} />
        <meshStandardMaterial {...MATTRESS} />
      </mesh>
      {/* Head section mattress — slightly tilted up */}
      <group position={[-0.85, mattressY + 0.04, 0]} rotation={[0, 0, -0.18]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.4, 0.06, 0.7]} />
          <meshStandardMaterial {...MATTRESS} />
        </mesh>
      </group>

      {/* ─── Headboard brace ──────────────────────────────────────── */}
      <mesh position={[-1.05, frameY + 0.06, 0]} castShadow>
        <boxGeometry args={[0.03, 0.12, 0.7]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
    </group>
  );
});

export { Stretcher };
