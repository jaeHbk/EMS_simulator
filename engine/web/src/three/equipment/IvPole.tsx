// IV pole — Phase A swap to GLB. Falls back to primitive cube if absent.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function IvPole() {
  return (
    <Suspense fallback={null}>
      <IvPoleMesh />
    </Suspense>
  );
}

function IvPoleMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.ivPole);
  return <primitive object={scene} dispose={null} />;
}
