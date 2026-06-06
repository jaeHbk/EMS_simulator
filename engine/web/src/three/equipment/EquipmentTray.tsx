// Renders all equipment items at their tray (bench-seat) poses or, when
// attached, snaps them to the patient anchor. Click → POST /api/actions
// (optimistic), watcher hook reconciles with server echo.
//
// Animation: the snap from tray pose to attached pose is a 400 ms tween
// driven by useFrame; respects prefers-reduced-motion via a single
// jump-cut when the OS pref is set.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { postAction } from '../../lib/actions';
import { useAttachedEquipment } from '../../lib/useInterventions';
import { Bvm } from './Bvm';
import { Defibrillator } from './Defibrillator';
import { DrugBox } from './DrugBox';
import { IntubationKit } from './IntubationKit';
import { IvPole } from './IvPole';
import { NrbMask } from './NrbMask';
import { OxygenTank } from './OxygenTank';
import { PickableMesh } from './PickableMesh';
import { EQUIPMENT, EQUIPMENT_TABLE, type EquipmentItem } from './registry';

const ANIM_DURATION_S = 0.4;

const COMPONENT_BY_ID: Record<EquipmentItem['id'], () => JSX.Element> = {
  nrb: () => <NrbMask />,
  bvm: () => <Bvm />,
  iv_line: () => <IvPole />,
  defib_pads: () => <Defibrillator />,
  drug_box: () => <DrugBox />,
  oxygen_tank: () => <OxygenTank />,
  intubation_kit: () => <IntubationKit />,
};

export function EquipmentTray() {
  const attached = useAttachedEquipment();
  const reducedMotion = useReducedMotion();

  return (
    <group>
      <BedsideTable />
      {EQUIPMENT.map((item) => (
        <EquipmentSlot
          key={item.id}
          item={item}
          isAttached={attached.has(item.id)}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

/**
 * A single bedside table that supports every tool in the registry. Rendered
 * once at world origin; geometry derived from EQUIPMENT_TABLE. Top is a
 * thin slab; four cylindrical legs reach the floor. PBR-styled stainless +
 * dark formica top.
 */
function BedsideTable() {
  const { centerX, centerZ, width, depth, topY, height } = EQUIPMENT_TABLE;
  const TOP_THICKNESS = 0.04;
  const LEG_RADIUS = 0.018;
  const inset = 0.06;
  const legY = (topY - TOP_THICKNESS / 2) / 2; // midpoint between floor and underside of top
  const legHeight = topY - TOP_THICKNESS / 2;
  void height;
  const corners: Array<[number, number]> = [
    [centerX - width / 2 + inset, centerZ - depth / 2 + inset],
    [centerX + width / 2 - inset, centerZ - depth / 2 + inset],
    [centerX - width / 2 + inset, centerZ + depth / 2 - inset],
    [centerX + width / 2 - inset, centerZ + depth / 2 - inset],
  ];
  return (
    <group>
      {/* Tabletop */}
      <mesh
        position={[centerX, topY - TOP_THICKNESS / 2, centerZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, TOP_THICKNESS, depth]} />
        <meshStandardMaterial color="#1d2630" roughness={0.45} metalness={0.15} />
      </mesh>
      {/* Subtle stainless trim around the edge of the top */}
      <mesh position={[centerX, topY - TOP_THICKNESS - 0.005, centerZ]}>
        <boxGeometry args={[width + 0.005, 0.008, depth + 0.005]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Four legs */}
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, legY, z]} castShadow>
          <cylinderGeometry args={[LEG_RADIUS, LEG_RADIUS, legHeight, 12]} />
          <meshStandardMaterial color="#c8ced6" metalness={0.85} roughness={0.25} />
        </mesh>
      ))}
      {/* Cross-strut for visual stability under the top */}
      <mesh
        position={[centerX, topY - TOP_THICKNESS - 0.015, centerZ]}
        castShadow
      >
        <boxGeometry args={[width - 0.18, 0.012, 0.025]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

interface SlotProps {
  item: EquipmentItem;
  isAttached: boolean;
  reducedMotion: boolean;
}

function EquipmentSlot({ item, isAttached, reducedMotion }: SlotProps) {
  const groupRef = useRef<Group>(null);
  const progressRef = useRef(0);
  const startPosRef = useRef<[number, number, number]>(item.trayPosition);

  const hasAttachedPose = item.attachedPosition !== null;

  const targetPos: [number, number, number] = useMemo(() => {
    if (isAttached && hasAttachedPose) {
      return item.attachedPosition as [number, number, number];
    }
    return item.trayPosition;
  }, [isAttached, hasAttachedPose, item]);

  // Capture current pose + reset progress whenever the target changes.
  // Done in an effect (not the render body) because it has side effects;
  // running it in render is a React anti-pattern.
  useEffect(() => {
    const cur = groupRef.current?.position;
    startPosRef.current = cur
      ? [cur.x, cur.y, cur.z]
      : item.trayPosition;
    progressRef.current = 0;
  }, [targetPos, item.trayPosition]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    if (reducedMotion) {
      g.position.set(...targetPos);
      progressRef.current = 1;
      return;
    }
    if (progressRef.current < 1) {
      progressRef.current = Math.min(1, progressRef.current + dt / ANIM_DURATION_S);
      const t = easeInOut(progressRef.current);
      g.position.set(
        startPosRef.current[0] + (targetPos[0] - startPosRef.current[0]) * t,
        startPosRef.current[1] + (targetPos[1] - startPosRef.current[1]) * t,
        startPosRef.current[2] + (targetPos[2] - startPosRef.current[2]) * t,
      );
    }
  });

  const handlePick = (): void => {
    if (isAttached) return;
    void postAction({
      action_type: 'apply_equipment',
      params: item.defaultParams,
    });
  };

  const handleDetach = (): void => {
    if (!isAttached) return;
    void postAction({
      action_type: 'remove_equipment',
      params: { equipment: item.id, attach_point: item.attachPoint },
    });
  };

  const Component = COMPONENT_BY_ID[item.id];
  const yaw = item.attachedYaw ?? 0;

  return (
    <group ref={groupRef} position={item.trayPosition} rotation={[0, yaw, 0]}>
      <PickableMesh
        position={[0, 0, 0]}
        onPick={handlePick}
        onDetach={handleDetach}
        attached={isAttached}
        draggable={item.draggable}
        label={item.label}
      >
        <Component />
      </PickableMesh>
    </group>
  );
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Subscribes to the OS reduced-motion preference. The previous version
 *  read matchMedia once on mount; toggling the OS pref mid-session
 *  didn't take effect. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
