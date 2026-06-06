// Drug box: rounded plastic case with a colored lid stripe.

import { RoundedBox } from '@react-three/drei';
import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';
import { useAssetPresence } from '../lib/assetManifest';

export function DrugBox() {
  const present = useAssetPresence(ASSET_PATHS.equipment.drugBox);
  if (!present) return <ProceduralDrugBox />;
  return (
    <Suspense fallback={<ProceduralDrugBox />}>
      <GlbDrugBox />
    </Suspense>
  );
}

function GlbDrugBox() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.drugBox);
  return <primitive object={scene} dispose={null} />;
}

function ProceduralDrugBox() {
  return (
    <group>
      <RoundedBox
        args={[0.28, 0.12, 0.18]}
        radius={0.012}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#cf3e4d" roughness={0.45} />
      </RoundedBox>
      {/* Lid seam */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.282, 0.005, 0.182]} />
        <meshStandardMaterial color="#0e131c" />
      </mesh>
      {/* Latch */}
      <mesh position={[0, 0.04, 0.092]}>
        <boxGeometry args={[0.04, 0.025, 0.004]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}
