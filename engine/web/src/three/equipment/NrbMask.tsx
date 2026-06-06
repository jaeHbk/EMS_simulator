// Non-rebreather mask: green-rim sphere with a small reservoir bag.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';
import { useAssetPresence } from '../lib/assetManifest';

export function NrbMask() {
  const present = useAssetPresence(ASSET_PATHS.equipment.nrbMask);
  if (!present) return <ProceduralNrbMask />;
  return (
    <Suspense fallback={<ProceduralNrbMask />}>
      <GlbNrbMask />
    </Suspense>
  );
}

function GlbNrbMask() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.nrbMask);
  return <primitive object={scene} dispose={null} />;
}

function ProceduralNrbMask() {
  return (
    <group>
      {/* Mask body */}
      <mesh castShadow>
        <sphereGeometry args={[0.085, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial
          color="#cfe4ff"
          roughness={0.25}
          metalness={0.05}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Green rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.085, 0.008, 8, 24]} />
        <meshStandardMaterial color="#2eb46b" />
      </mesh>
      {/* Reservoir bag */}
      <mesh position={[0, -0.13, 0]} castShadow>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#cfe4ff" transparent opacity={0.6} />
      </mesh>
      {/* Tube to reservoir */}
      <mesh position={[0, -0.06, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.07, 8]} />
        <meshStandardMaterial color="#cfe4ff" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
