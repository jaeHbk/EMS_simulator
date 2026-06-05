// Drug box — Phase C swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function DrugBox() {
  return (
    <Suspense fallback={null}>
      <DrugBoxMesh />
    </Suspense>
  );
}

function DrugBoxMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.drugBox);
  return <primitive object={scene} dispose={null} />;
}
