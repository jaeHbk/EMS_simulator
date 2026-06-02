// Wraps the lazy-loaded 3D Scene in a Suspense boundary and a banner with
// orbit hints. The scene reads frames from the monitor store directly —
// this slot doesn't need props.

import { Suspense, lazy } from 'react';
import { CameraBar } from '../scene/CameraBar';
import { AssessmentLog } from '../scene/AssessmentLog';
import { ObjectTooltip } from '../scene/ObjectTooltip';

const Scene = lazy(() =>
  import('../../three/Scene').then((mod) => ({ default: mod.Scene })),
);

export function SceneSlot() {
  return (
    <div className="scene">
      <Suspense fallback={<SceneLoading />}>
        <Scene />
      </Suspense>
      <AssessmentLog />
      <CameraBar />
      <ObjectTooltip />
      <div className="scene__banner" aria-hidden="true">
        drag to orbit · scroll to zoom
      </div>
    </div>
  );
}

function SceneLoading() {
  return (
    <div className="scene__loading" aria-label="Loading 3D scene">
      loading 3D scene…
    </div>
  );
}
