import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Stretcher } from './Stretcher';
import { Patient } from './Patient';
import { Monitor3D } from './Monitor3D';
import { AmbulanceInterior } from './AmbulanceInterior';
import { EquipmentTray } from './equipment/EquipmentTray';
import { InteriorLightRig } from './lights/InteriorLightRig';

export function Scene() {
  // Camera lives just inside the rear doors looking toward the bulkhead.
  // The stretcher (and patient) sit at z=0, slightly toward the bulkhead so
  // the camera frames patient + bedside monitor.
  return (
    <Canvas
      shadows
      camera={{ position: [2.4, 1.7, 2.2], fov: 36 }}
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
        {/* Monitor on its stand, just past the patient's head, on the
            curb side so the camera frames screen + patient together. */}
        <Monitor3D position={[-1.4, 1.4, 0.55]} />
      </group>

      {/* ContactShadows removed: directional light already casts shadows.
          Two shadow systems were the biggest 60 fps risk on integrated
          GPUs per the perf audit; one is enough. */}

      <OrbitControls
        target={[0, 1.0, 0]}
        enablePan={false}
        minDistance={2}
        maxDistance={4.5}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.05}
        minAzimuthAngle={-Math.PI / 2.5}
        maxAzimuthAngle={Math.PI / 2.5}
        makeDefault
      />
    </Canvas>
  );
}
