// Oxygen tank — Phase C swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function OxygenTank() {
  return (
    <Suspense fallback={null}>
      <OxygenTankMesh />
    </Suspense>
  );
}

function OxygenTankMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.oxygenTank);
  return <primitive object={scene} dispose={null} />;
}
