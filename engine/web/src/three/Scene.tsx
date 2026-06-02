import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Stretcher } from './Stretcher';
import { Patient } from './Patient';
import { Monitor3D } from './Monitor3D';
import { AmbulanceInterior } from './AmbulanceInterior';
import { EquipmentTray } from './equipment/EquipmentTray';
import { InteriorLightRig } from './lights/InteriorLightRig';
import { ORBIT } from './interaction/orbitBounds';
import { CameraRig } from './interaction/CameraRig';
import { PatientHotspots } from './interaction/assessment/PatientHotspots';
import { useCameraStore } from './interaction/cameraStore';
import { useObjectTooltip } from './interaction/useObjectTooltip';

export function Scene() {
  const monitorTip = useObjectTooltip('Bedside monitor', 'Click to focus the view');
  const focusMonitor = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    useCameraStore.getState().request('monitor');
  };
  // Camera lives just inside the rear doors looking toward the bulkhead.
  // The compartment is a sealed box (x∈[-1.8,1.8], z∈[-1.0,1.0], y∈[0,2.1]),
  // so the eye must sit *inside* those walls — otherwise it stares at the
  // unlit back face of the curb-side wall and the whole frame goes flat
  // grey. Sit it near the rear-curb corner, well within the shell, angled
  // toward the patient + bedside monitor.
  return (
    <Canvas
      shadows
      camera={{ position: [1.45, 1.6, 0.75], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      role="img"
      aria-label="Ambulance compartment with a patient on a stretcher and a vitals monitor"
    >
      <color attach="background" args={['#060b14']} />
      <fog attach="fog" args={['#060b14', 8, 24]} />

      <InteriorLightRig />
      <AmbulanceInterior />
      <EquipmentTray />

      {/* The stretcher's local origin sits at the floor at world (0,0,0),
          but we shift it toward -z so the patient's torso aligns with the
          curb-side monitor bracket. */}
      <group position={[0, 0, -0.15]}>
        <Stretcher />
        <Patient />
        <PatientHotspots />
        {/* Monitor on its stand, just past the patient's head, on the
            curb side so the camera frames screen + patient together.
            Wrapped in an interactive group: click focuses the camera on
            it, hover names it. */}
        <group onClick={focusMonitor} {...monitorTip}>
          <Monitor3D position={[-1.4, 1.4, 0.55]} />
        </group>
      </group>

      {/* ContactShadows removed: directional light already casts shadows.
          Two shadow systems were the biggest 60 fps risk on integrated
          GPUs per the perf audit; one is enough. */}

      <CameraRig />

      {/* Orbit is constrained to an arc that keeps the eye *inside* the
          compartment shell. The cabin is narrow on z (±1.0 m), so a free
          orbit would punch the camera through the curb wall and flatten
          the frame to grey. Distance + azimuth + polar limits below were
          chosen (and screenshot-verified) so every reachable pose stays
          within x∈[-1.7,1.7], z∈[-0.9,0.9], y∈[0.2,1.95]. */}
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
