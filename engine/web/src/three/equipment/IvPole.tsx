// IV pole + bag + drip chamber. GLB when present, procedural fallback otherwise.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';
import { useAssetPresence } from '../lib/assetManifest';

export function IvPole() {
  const present = useAssetPresence(ASSET_PATHS.equipment.ivPole);
  if (!present) return <ProceduralIvPole />;
  return (
    <Suspense fallback={<ProceduralIvPole />}>
      <GlbIvPole />
    </Suspense>
  );
}

function GlbIvPole() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.ivPole);
  return <primitive object={scene} dispose={null} />;
}

function ProceduralIvPole() {
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
      {/* Tubing */}
      <mesh position={[0.04, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.003, 0.003, 0.2, 6]} />
        <meshStandardMaterial color="#cfe4ff" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
