// A pulsing ring on a patient region with a drei <Html> button for
// keyboard/SR users (mirrors the equipment-a11y pattern). Clicking reads
// the live frame, derives a finding, and records it. The ring dims with
// camera distance so it stays subtle when zoomed out.

import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { Vector3, type Mesh, type MeshBasicMaterial } from 'three';
import { useMonitorStore } from '../../../ui/monitor/store/monitorStore';
import { deriveFinding, type RegionId } from './findings';
import { useAssessmentStore } from './assessmentStore';

interface Props {
  id: RegionId;
  label: string;
  position: [number, number, number];
}

export function HotspotMarker({ id, label, position }: Props) {
  const ringRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const worldPos = useRef(new Vector3());

  // Dim with camera distance: opacity ~0.55 near → 0.2 far.
  useFrame((state) => {
    const mesh = ringRef.current;
    if (!mesh) return;
    mesh.getWorldPosition(worldPos.current);
    const d = state.camera.position.distanceTo(worldPos.current);
    const mat = mesh.material as MeshBasicMaterial;
    const base = hovered ? 0.85 : 0.55;
    mat.opacity = Math.max(0.2, base - (d - 1.2) * 0.4);
  });

  const assess = (): void => {
    const frame = useMonitorStore.getState().latest;
    if (!frame) return;
    const finding = deriveFinding(id, frame);
    useAssessmentStore.getState().record(id, finding, frame.sim_time_s);
  };

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    assess();
  };

  return (
    <group position={position}>
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={onClick}
      >
        <ringGeometry args={[0.045, 0.07, 24]} />
        <meshBasicMaterial color="#5ab0ff" transparent opacity={0.55} />
      </mesh>
      <Html
        center
        distanceFactor={6}
        zIndexRange={[0, 0]}
        wrapperClass="equipment-a11y"
      >
        <button
          type="button"
          className="equipment-a11y__btn"
          aria-label={`Assess ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            assess();
          }}
        >
          {label}
        </button>
      </Html>
    </group>
  );
}
