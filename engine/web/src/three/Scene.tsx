import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, useTexture } from '@react-three/drei';
import { RepeatWrapping } from 'three';
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
import { probeAssets, useAssetPresence } from './lib/assetManifest';

// All asset URLs we may try to load. Probed once on mount; the manifest
// then short-circuits any consumer whose asset is absent so drei's loaders
// never see (and never throw on) a missing file.
const ALL_ASSET_URLS: readonly string[] = [
  ASSET_PATHS.hdri.clinicalRoom,
  ASSET_PATHS.patient,
  ASSET_PATHS.equipment.defibrillator,
  ASSET_PATHS.equipment.ivPole,
  ASSET_PATHS.equipment.bvm,
  ASSET_PATHS.equipment.nrbMask,
  ASSET_PATHS.equipment.intubationKit,
  ASSET_PATHS.equipment.drugBox,
  ASSET_PATHS.equipment.oxygenTank,
  ASSET_PATHS.equipment.monitorBedside,
  ASSET_PATHS.floor.albedo,
  ASSET_PATHS.floor.normal,
  ASSET_PATHS.floor.roughness,
];

export function Scene() {
  const monitorTip = useObjectTooltip('Bedside monitor', 'Click to focus the view');
  const focusMonitor = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    useCameraStore.getState().request('monitor');
  };

  // Probe every asset once on mount — the manifest then drives whether
  // each consumer attempts a real load or renders its primitive fallback.
  // Missing assets never reach drei's loaders, so a bare `public/assets/`
  // tree won't blank-screen the app.
  useEffect(() => {
    probeAssets(ALL_ASSET_URLS);
  }, []);

  // Re-render when the HDRI presence flips so the Environment block
  // either renders or stays out of the tree entirely.
  const hdriPresent = useAssetPresence(ASSET_PATHS.hdri.clinicalRoom);
  const albedoPresent = useAssetPresence(ASSET_PATHS.floor.albedo);
  const normalPresent = useAssetPresence(ASSET_PATHS.floor.normal);
  const roughnessPresent = useAssetPresence(ASSET_PATHS.floor.roughness);
  const floorReady = albedoPresent && normalPresent && roughnessPresent;

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
          Only mounted when the manifest confirms the file is present —
          drei's Environment throws synchronously on a missing file and
          there is no Suspense / ErrorBoundary recovery path that keeps
          the rest of the scene mounted. The directional + ambient lights
          below carry the scene until an HDRI is dropped in. */}
      {hdriPresent && (
        <Suspense fallback={null}>
          <Environment files={ASSET_PATHS.hdri.clinicalRoom} background />
        </Suspense>
      )}
      {!hdriPresent && <color attach="background" args={['#1a232e']} />}

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
      {/* Rim directional, no shadow caster, fills detail behind the patient. */}
      <directionalLight
        position={[-3.0, 2.5, -1.5]}
        intensity={0.5}
        color="#dfe9ff"
      />

      {/* Phase C: PBR-textured floor with normal + roughness maps. Only
          mounted when the manifest confirms all three texture files are
          present; otherwise we render the flat-gray plane directly so
          drei's useTexture is never called with a missing file. */}
      {floorReady ? (
        <Suspense
          fallback={
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[20, 20]} />
              <meshStandardMaterial color="#9aa3ad" roughness={0.85} />
            </mesh>
          }
        >
          <TexturedFloor />
        </Suspense>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#9aa3ad" roughness={0.85} />
        </mesh>
      )}
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

function TexturedFloor() {
  const textures = useTexture([
    ASSET_PATHS.floor.albedo,
    ASSET_PATHS.floor.normal,
    ASSET_PATHS.floor.roughness,
  ]);
  for (const t of textures) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(6, 6);
  }
  const [albedo, normal, roughness] = textures;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial
        map={albedo}
        normalMap={normal}
        roughnessMap={roughness}
      />
    </mesh>
  );
}
