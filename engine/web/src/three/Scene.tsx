import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import { Suspense, useEffect } from 'react';
import { Stretcher } from './Stretcher';
import { Patient } from './Patient';
import { Monitor3D } from './Monitor3D';
import { EquipmentTray } from './equipment/EquipmentTray';
import { ORBIT } from './interaction/orbitBounds';
import { CameraRig } from './interaction/CameraRig';
import { PatientHotspots } from './interaction/assessment/PatientHotspots';
import { useCameraStore } from './interaction/cameraStore';
import { useObjectTooltip } from './interaction/useObjectTooltip';
import { ASSET_PATHS } from './lib/assetPaths';
import { useGltfWithFallback } from './lib/useGltfWithFallback';

export function Scene() {
  const monitorTip = useObjectTooltip('Bedside monitor', 'Click to focus the view');
  const focusMonitor = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    useCameraStore.getState().request('monitor');
  };

  // Warm the GLB caches in parallel with the HDRI load.
  useEffect(() => {
    useGltfWithFallback.preload(ASSET_PATHS.equipment.defibrillator);
    useGltfWithFallback.preload(ASSET_PATHS.equipment.ivPole);
  }, []);

  return (
    <Canvas
      shadows
      camera={{ position: [1.8, 1.6, 1.6], fov: 38 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      role="img"
      aria-label="Patient on a stretcher with bedside equipment"
    >
      {/* HDRI provides both image-based lighting AND the visible backdrop.
          Suspense fallback is null so a missing HDRI shows the canvas
          clear color rather than crashing the scene. */}
      <Suspense fallback={null}>
        <Environment files={ASSET_PATHS.hdri.clinicalRoom} background />
      </Suspense>

      {/* One directional shadow caster — keeps shadow texel work modest. */}
      <directionalLight
        position={[3.5, 4.5, 2.0]}
        intensity={1.4}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={12}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      {/* Soft global fill so the patient never goes pitch-dark on
          integrated GPUs that don't fully resolve IBL. */}
      <ambientLight intensity={0.25} />

      {/* Phase A: simple gray plane floor. Phase C swaps to PBR-textured. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.85} />
      </mesh>
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.45}
        scale={6}
        blur={2.4}
        far={3}
      />

      {/* Stretcher origin at world (0,0,0); patient torso aligns with bedside monitor. */}
      <group position={[0, 0, -0.15]}>
        <Stretcher />
        <Patient />
        <PatientHotspots />
        <group onClick={focusMonitor} {...monitorTip}>
          <Monitor3D position={[-1.4, 1.4, 0.55]} />
        </group>
      </group>

      <EquipmentTray />

      <CameraRig />

      <OrbitControls
        target={[0, 1.0, 0]}
        enablePan={false}
        minDistance={ORBIT.minDistance}
        maxDistance={ORBIT.maxDistance}
        minPolarAngle={ORBIT.minPolar}
        maxPolarAngle={ORBIT.maxPolar}
        minAzimuthAngle={ORBIT.minAzimuth}
        maxAzimuthAngle={ORBIT.maxAzimuth}
        makeDefault
      />
    </Canvas>
  );
}
