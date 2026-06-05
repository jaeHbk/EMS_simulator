// Bag-valve mask — Phase C swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function Bvm() {
  return (
    <Suspense fallback={null}>
      <BvmMesh />
    </Suspense>
  );
}

function BvmMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.bvm);
  return <primitive object={scene} dispose={null} />;
}
