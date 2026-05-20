// Defibrillator with pads. Body + handle + emissive ready light + two
// gel pads on cables. Slice 1B will swap in a real GLB.

export function Defibrillator() {
  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.18, 0.22]} />
        <meshStandardMaterial color="#1d2630" roughness={0.6} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0.04, 0.111]}>
        <planeGeometry args={[0.18, 0.08]} />
        <meshStandardMaterial
          color="#0a3322"
          emissive="#34d3a3"
          emissiveIntensity={0.4}
          roughness={0.3}
        />
      </mesh>
      {/* Ready indicator */}
      <mesh position={[0.12, -0.06, 0.111]}>
        <sphereGeometry args={[0.012, 10, 10]} />
        <meshStandardMaterial
          color="#34d3a3"
          emissive="#34d3a3"
          emissiveIntensity={1.4}
        />
      </mesh>
      {/* Handle */}
      <mesh position={[0, 0.115, 0]}>
        <torusGeometry args={[0.05, 0.012, 8, 18, Math.PI]} />
        <meshStandardMaterial color="#0e131c" />
      </mesh>
      {/* Two pads on cables — represented as small puck shapes. */}
      <Pad offset={[-0.18, 0, 0]} />
      <Pad offset={[0.18, 0, 0]} />
    </group>
  );
}

function Pad({ offset }: { offset: [number, number, number] }) {
  return (
    <group position={offset}>
      <mesh position={[0, -0.1, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.01, 16]} />
        <meshStandardMaterial color="#f5f0c8" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.1, 6]} />
        <meshStandardMaterial color="#1d2630" />
      </mesh>
    </group>
  );
}
