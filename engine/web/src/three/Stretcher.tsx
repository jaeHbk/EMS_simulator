// Stylized ambulance stretcher built from primitives. Four legs + a wheel
// per corner and a dark mattress with a thin blanket. The compartment
// floor is owned by AmbulanceInterior; this component only contributes
// the cot itself.

import { memo } from 'react';

const Stretcher = memo(function Stretcher() {
  const frameY = 0.86;
  const mattressY = 0.94;
  const legY = 0.43;

  return (
    <group>
      {/* Frame rails */}
      <mesh position={[0, frameY, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.06, 0.9]} />
        <meshStandardMaterial color="#243042" metalness={0.4} roughness={0.4} />
      </mesh>

      {/* Legs */}
      {[
        [-0.95, 0.35],
        [0.95, 0.35],
        [-0.95, -0.35],
        [0.95, -0.35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x as number, legY, z as number]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.86, 16]} />
          <meshStandardMaterial color="#3a4658" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      {/* Wheels */}
      {[
        [-0.95, 0.4],
        [0.95, 0.4],
        [-0.95, -0.4],
        [0.95, -0.4],
      ].map(([x, z], i) => (
        <mesh key={`w${i}`} position={[x as number, 0.08, z as number]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.05, 16]} />
          <meshStandardMaterial color="#0e131c" roughness={0.7} metalness={0.1} />
        </mesh>
      ))}

      {/* Mattress */}
      <mesh position={[0, mattressY, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.1, 0.7]} />
        <meshStandardMaterial color="#1a2230" roughness={0.8} />
      </mesh>

      {/* Blanket */}
      <mesh position={[0.1, mattressY + 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.04, 0.66]} />
        <meshStandardMaterial color="#3ddc97" roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Headboard */}
      <mesh position={[-1.0, mattressY + 0.1, 0]} castShadow>
        <boxGeometry args={[0.05, 0.4, 0.7]} />
        <meshStandardMaterial color="#3a4658" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
});

export { Stretcher };
