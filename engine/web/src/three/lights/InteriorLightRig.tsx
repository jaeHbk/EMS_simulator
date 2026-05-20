// Three-light rig sized for the ambulance interior:
//   - Overhead LED panel (rectAreaLight) — clinical-cool, primary key.
//   - Warm interior fill (point) near the cabinet line — sells the "cabin
//     interior" feel without flattening shadows.
//   - Cool exterior wash (directional) angled through the curb-side
//     window — implies daylight outside the parked rig.
//
// rectAreaLights need a one-shot RectAreaLightUniformsLib.init() to be
// visible; we run it on mount and never unmount it.

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RectAreaLight } from 'three';

let rectAreaInited = false;

export function InteriorLightRig() {
  // Init runs once at module load so a remount doesn't re-init.
  if (!rectAreaInited) {
    RectAreaLightUniformsLib.init();
    rectAreaInited = true;
  }

  const ledPanel = useMemo(() => {
    const l = new RectAreaLight(0xf4f7ff, 4.0, 1.4, 0.5);
    l.position.set(0, 2.0, 0);
    l.lookAt(0, 0, 0);
    return l;
  }, []);

  const { scene } = useThree();
  useEffect(() => {
    scene.add(ledPanel);
    return () => {
      scene.remove(ledPanel);
    };
  }, [scene, ledPanel]);

  return (
    <>
      {/* Soft global fill so the interior never looks pitch-dark on
          mid-tier GPUs that don't fully resolve area lighting. */}
      <ambientLight intensity={0.35} />

      {/* Warm cabin fill near the cabinet line. */}
      <pointLight
        position={[0.8, 1.7, -0.7]}
        intensity={0.6}
        color="#ffd6a5"
        distance={6}
        decay={2}
      />

      {/* Cool exterior wash through the curb-side window. 1024 shadow
          map is plenty for a 4 m scene; 2048 was 4× more texel work
          for no visible gain on integrated GPUs. */}
      <directionalLight
        position={[-3.5, 2.5, 1.0]}
        intensity={1.1}
        color="#9ec5ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={12}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
    </>
  );
}
