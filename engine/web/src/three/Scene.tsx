import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { Stretcher } from './Stretcher';
import { Patient } from './Patient';
import { Monitor3D } from './Monitor3D';
import type { VitalsFrame } from '../lib/stream';

interface Props {
  frame: VitalsFrame | null;
}

export function Scene({ frame }: Props) {
  return (
    <Canvas
      shadows
      camera={{ position: [3.5, 2.0, 4.5], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      role="img"
      aria-label="3D scene of a patient on a stretcher with a vitals monitor"
    >
      <color attach="background" args={['#0a0e14']} />
      <fog attach="fog" args={['#0a0e14', 7, 18]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <pointLight position={[-3, 2, -2]} intensity={0.5} color="#3ddc97" />

      <Suspense fallback={null}>
        <Environment preset="warehouse" />
      </Suspense>

      <group position={[0, 0, 0]}>
        <Stretcher />
        <Patient frame={frame} />
        <Monitor3D frame={frame} position={[1.6, 1.4, -0.4]} />
      </group>

      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.6}
        scale={12}
        blur={2.6}
        far={4}
      />

      <OrbitControls
        target={[0, 1.0, 0]}
        enablePan={false}
        minDistance={3}
        maxDistance={9}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.05}
        makeDefault
      />
    </Canvas>
  );
}
