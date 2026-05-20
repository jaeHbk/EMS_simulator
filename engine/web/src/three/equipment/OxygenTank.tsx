// O₂ tank: capped cylinder + regulator at the top.

export function OxygenTank() {
  return (
    <group>
      {/* Tank body */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.36, 18]} />
        <meshStandardMaterial color="#2eb46b" roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Top dome */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <sphereGeometry args={[0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2eb46b" roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Regulator */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.06, 0.04, 0.05]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Pressure dial */}
      <mesh position={[0.03, 0.43, 0.026]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.005, 14]} />
        <meshStandardMaterial color="#0e131c" />
      </mesh>
    </group>
  );
}
