// Ambulance compartment built from primitives. ~6–9k tris total.
//
// Layout (looking down +Y, looking forward +X, patient lays head-toward
// -X with the head at the bulkhead end):
//
//                 +Z (curb side, has windows)
//                  ^
//                  |
//   bulkhead ──────┼────── rear doors
//                  |
//                  v
//                 -Z (street side, has bench)
//
// All meshes use simple painterly materials (no PBR maps). AO is provided
// by the cool directional light + AccumulativeShadows in Scene.tsx.

import { memo } from 'react';
import { RoundedBox } from '@react-three/drei';

const COLORS = {
  wall: '#dfe5ec',     // pale clinical white
  floor: '#1f2632',    // dark non-slip rubber
  cabinet: '#cfd6df',  // satin polymer
  cabinetTrim: '#4f5d72',
  rail: '#c8ced6',     // brushed aluminum
  bench: '#2a323e',    // dark vinyl
  benchPad: '#3a4451',
  o2Green: '#2eb46b',
  doorPanel: '#cfd6df',
  bulkhead: '#b8c0cb',
};

const AmbulanceInterior = memo(function AmbulanceInterior() {
  // Compartment dimensions (interior), in meters. Roughly a Type-III rig:
  //   L (along x) = 3.6, W (along z) = 2.0, H (along y) = 2.1.
  const lenX = 3.6;
  const widZ = 2.0;
  const hgtY = 2.1;
  const halfX = lenX / 2;
  const halfZ = widZ / 2;

  return (
    <group>
      {/* ─── Floor (textured rubber mat) ─────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[lenX, widZ]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.95} />
      </mesh>

      {/* ─── Ceiling ──────────────────────────────────────────────── */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, hgtY, 0]} receiveShadow>
        <planeGeometry args={[lenX, widZ]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.85} />
      </mesh>

      {/* LED panel housing on the ceiling — visual only; the light is in
          InteriorLightRig. */}
      <mesh position={[0, hgtY - 0.02, 0]}>
        <boxGeometry args={[1.4, 0.04, 0.5]} />
        <meshStandardMaterial
          color="#f5f8ff"
          emissive="#ffffff"
          emissiveIntensity={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* ─── Bulkhead (front wall, behind patient's head) ────────── */}
      <mesh position={[-halfX, hgtY / 2, 0]} receiveShadow>
        <boxGeometry args={[0.05, hgtY, widZ]} />
        <meshStandardMaterial color={COLORS.bulkhead} roughness={0.85} />
      </mesh>

      {/* ─── Rear doors (closed) ──────────────────────────────────── */}
      <RoundedBox
        args={[0.05, hgtY * 0.95, widZ - 0.06]}
        radius={0.02}
        smoothness={2}
        position={[halfX, hgtY / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={COLORS.doorPanel} roughness={0.6} />
      </RoundedBox>

      {/* ─── Street-side wall (-Z): bench seat + cabinets above ──── */}
      <StreetSideWall lenX={lenX} hgtY={hgtY} z={-halfZ} />

      {/* ─── Curb-side wall (+Z): windows + grab rail ─────────────── */}
      <CurbSideWall lenX={lenX} hgtY={hgtY} z={halfZ} />
    </group>
  );
});

interface SideWallProps {
  lenX: number;
  hgtY: number;
  z: number;
}

function StreetSideWall({ lenX, hgtY, z }: SideWallProps) {
  // Wall is broken into 4 stacked strips: floor-to-bench (~0.5 m),
  // bench depth (cushion sits forward of the wall), wall above bench up to
  // upper-cabinet line (~1.4 m), upper cabinet face, ceiling fillet.
  const benchTopY = 0.5;
  const benchDepth = 0.55;
  const cabinetBottomY = 1.5;
  const cabinetTopY = hgtY - 0.1;

  return (
    <group>
      {/* Wall behind everything. */}
      <mesh
        position={[0, hgtY / 2, z - 0.01]}
        rotation={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[lenX, hgtY]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.85} side={2} />
      </mesh>

      {/* Bench seat base (vinyl-covered box). */}
      <mesh
        position={[0, benchTopY / 2, z + benchDepth / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[lenX * 0.85, benchTopY, benchDepth]} />
        <meshStandardMaterial color={COLORS.bench} roughness={0.7} />
      </mesh>
      {/* Bench cushion (a slightly proud darker pad). */}
      <RoundedBox
        args={[lenX * 0.85, 0.08, benchDepth + 0.02]}
        radius={0.02}
        smoothness={2}
        position={[0, benchTopY + 0.04, z + benchDepth / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={COLORS.benchPad} roughness={0.55} />
      </RoundedBox>

      {/* Upper cabinet row. */}
      <mesh
        position={[
          0,
          (cabinetBottomY + cabinetTopY) / 2,
          z + 0.18,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[lenX * 0.85, cabinetTopY - cabinetBottomY, 0.36]} />
        <meshStandardMaterial color={COLORS.cabinet} roughness={0.5} />
      </mesh>
      {/* Cabinet trim line — thin dark stripe at top + bottom. */}
      <mesh position={[0, cabinetBottomY + 0.005, z + 0.36]}>
        <boxGeometry args={[lenX * 0.85, 0.01, 0.005]} />
        <meshStandardMaterial color={COLORS.cabinetTrim} />
      </mesh>
      <mesh position={[0, cabinetTopY - 0.005, z + 0.36]}>
        <boxGeometry args={[lenX * 0.85, 0.01, 0.005]} />
        <meshStandardMaterial color={COLORS.cabinetTrim} />
      </mesh>
      {/* Three handle channels splitting the cabinet face into doors. */}
      {[-0.95, 0, 0.95].map((x) => (
        <mesh
          key={x}
          position={[x, (cabinetBottomY + cabinetTopY) / 2, z + 0.365]}
        >
          <boxGeometry args={[0.02, cabinetTopY - cabinetBottomY - 0.05, 0.005]} />
          <meshStandardMaterial color={COLORS.cabinetTrim} />
        </mesh>
      ))}

      {/* O2 wall outlet — small green-ringed disc. */}
      <group position={[-lenX * 0.4, 1.25, z + 0.06]}>
        <mesh>
          <cylinderGeometry args={[0.04, 0.04, 0.02, 24]} />
          <meshStandardMaterial color="#1d2630" />
        </mesh>
        <mesh position={[0, 0, 0.012]}>
          <torusGeometry args={[0.045, 0.006, 8, 24]} />
          <meshStandardMaterial
            color={COLORS.o2Green}
            emissive={COLORS.o2Green}
            emissiveIntensity={0.2}
          />
        </mesh>
      </group>
    </group>
  );
}

function CurbSideWall({ lenX, hgtY, z }: SideWallProps) {
  // Two windows on the upper half, grab rail under them, plain wall below.
  const windowY = hgtY * 0.65;
  const windowH = 0.45;

  return (
    <group>
      {/* Wall plane. */}
      <mesh
        position={[0, hgtY / 2, z + 0.01]}
        rotation={[0, Math.PI, 0]}
        receiveShadow
      >
        <planeGeometry args={[lenX, hgtY]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.85} side={2} />
      </mesh>

      {/* Two windows — slightly emissive frosted plates. */}
      {[-0.85, 0.85].map((x) => (
        <mesh
          key={x}
          position={[x, windowY, z + 0.001]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[0.95, windowH]} />
          <meshStandardMaterial
            color="#cfe2ff"
            emissive="#cfe2ff"
            emissiveIntensity={0.35}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Grab rail along the length. */}
      <mesh
        position={[0, windowY - windowH / 2 - 0.08, z - 0.05]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.018, 0.018, lenX * 0.85, 12]} />
        <meshStandardMaterial color={COLORS.rail} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Two rail posts. */}
      {[-lenX * 0.4, lenX * 0.4].map((x) => (
        <mesh
          key={x}
          position={[x, windowY - windowH / 2 - 0.04, z - 0.025]}
          castShadow
        >
          <cylinderGeometry args={[0.02, 0.02, 0.08, 12]} />
          <meshStandardMaterial color={COLORS.rail} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export { AmbulanceInterior };
