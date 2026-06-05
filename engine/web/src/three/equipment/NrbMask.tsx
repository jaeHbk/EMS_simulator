// Non-rebreather mask — Phase C swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function NrbMask() {
  return (
    <Suspense fallback={null}>
      <NrbMaskMesh />
    </Suspense>
  );
}

function NrbMaskMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.nrbMask);
  return <primitive object={scene} dispose={null} />;
}
