// Bag-valve mask: silicone bag + valve assembly + small face mask.

export function Bvm() {
  return (
    <group>
      {/* Self-inflating bag */}
      <mesh castShadow>
        <sphereGeometry args={[0.09, 14, 10]} />
        <meshStandardMaterial color="#1d2630" roughness={0.7} />
      </mesh>
      <mesh castShadow scale={[1, 1.6, 1]}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshStandardMaterial color="#1d2630" roughness={0.7} />
      </mesh>
      {/* Valve cylinder */}
      <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, 0.07, 12]} />
        <meshStandardMaterial color="#cfd6df" />
      </mesh>
      {/* Face mask — wider, transparent. */}
      <mesh
        position={[0, 0, 0.18]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <coneGeometry args={[0.085, 0.04, 16]} />
        <meshStandardMaterial color="#cfe4ff" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
