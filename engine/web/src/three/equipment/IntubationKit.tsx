// Intubation kit: open case with a laryngoscope + ET tube row.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';
import { useAssetPresence } from '../lib/assetManifest';

export function IntubationKit() {
  const present = useAssetPresence(ASSET_PATHS.equipment.intubationKit);
  if (!present) return <ProceduralIntubationKit />;
  return (
    <Suspense fallback={<ProceduralIntubationKit />}>
      <GlbIntubationKit />
    </Suspense>
  );
}

function GlbIntubationKit() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.intubationKit);
  return <primitive object={scene} dispose={null} />;
}

function ProceduralIntubationKit() {
  return (
    <group>
      {/* Case */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.06, 0.2]} />
        <meshStandardMaterial color="#1d2630" roughness={0.6} />
      </mesh>
      {/* Foam insert */}
      <mesh position={[0, 0.034, 0]}>
        <boxGeometry args={[0.32, 0.005, 0.18]} />
        <meshStandardMaterial color="#3a4451" />
      </mesh>
      {/* Laryngoscope handle */}
      <mesh position={[-0.09, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.12, 14]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Blade */}
      <mesh position={[-0.02, 0.07, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <boxGeometry args={[0.012, 0.1, 0.015]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Two ET tubes */}
      {[-0.04, 0.04].map((z) => (
        <mesh
          key={z}
          position={[0.08, 0.06, z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.006, 0.006, 0.16, 8]} />
          <meshStandardMaterial color="#cfd6df" />
        </mesh>
      ))}
    </group>
  );
}
