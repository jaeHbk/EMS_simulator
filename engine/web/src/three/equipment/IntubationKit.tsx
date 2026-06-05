// Intubation kit — Phase C swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function IntubationKit() {
  return (
    <Suspense fallback={null}>
      <IntubationKitMesh />
    </Suspense>
  );
}

function IntubationKitMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.intubationKit);
  return <primitive object={scene} dispose={null} />;
}
