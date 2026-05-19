import { Suspense, lazy } from 'react';
import { useVitalsStream } from './lib/stream';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { ScenarioBadge } from './ui/ScenarioBadge';
import { VitalsPanel } from './ui/VitalsPanel';

// 3D scene is lazy-loaded so the first paint isn't blocked on Three.js.
const Scene = lazy(() =>
  import('./three/Scene').then((mod) => ({ default: mod.Scene })),
);

export function App() {
  const { frame, status } = useVitalsStream();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>EMS Simulator</h1>
        <ScenarioBadge status={status} />
      </header>
      <main className="scene-pane">
        <Suspense fallback={<SceneLoading />}>
          <Scene frame={frame} />
        </Suspense>
        <div className="banner">
          <ConnectionStatus status={status} />
          <span>drag to orbit · scroll to zoom</span>
        </div>
      </main>
      <VitalsPanel frame={frame} />
    </div>
  );
}

function SceneLoading() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--fg-dim)',
      }}
      aria-label="Loading 3D scene"
    >
      loading 3D scene…
    </div>
  );
}
