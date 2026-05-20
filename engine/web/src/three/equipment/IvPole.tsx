// IV bag + pole + drip chamber. Compact for the bench-tray pose.
// When attached, the pole stands upright; the registry positions it on
// the curb-side of the stretcher.

export function IvPole() {
  return (
    <group>
      {/* Pole */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.8, 12]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Hook */}
      <mesh position={[0, 0.8, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.025, 0.005, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Bag */}
      <mesh position={[0, 0.68, 0]} castShadow>
        <boxGeometry args={[0.1, 0.16, 0.04]} />
        <meshStandardMaterial color="#e6f1ff" transparent opacity={0.6} />
      </mesh>
      {/* Drip chamber */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.04, 10]} />
        <meshStandardMaterial color="#e6f1ff" transparent opacity={0.7} />
      </mesh>
      {/* Tubing — dangle. */}
      <mesh position={[0.04, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.003, 0.003, 0.2, 6]} />
        <meshStandardMaterial color="#cfe4ff" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
