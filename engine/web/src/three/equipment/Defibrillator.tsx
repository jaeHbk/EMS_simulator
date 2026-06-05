// Defibrillator — Phase A swap to GLB. Falls back to a primitive cube if
// the asset fails to load. The interactive wrapper (`PickableMesh`) lives
// in `EquipmentTray.tsx`; this file is just the visible mesh.

import { Suspense } from 'react';
import { ASSET_PATHS } from '../lib/assetPaths';
import { useGltfWithFallback } from '../lib/useGltfWithFallback';

export function Defibrillator() {
  return (
    <Suspense fallback={null}>
      <DefibrillatorMesh />
    </Suspense>
  );
}

function DefibrillatorMesh() {
  const { scene } = useGltfWithFallback(ASSET_PATHS.equipment.defibrillator);
  return <primitive object={scene} dispose={null} />;
}
