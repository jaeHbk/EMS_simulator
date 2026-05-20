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
import { EQUIPMENT, type EquipmentItem } from './registry';

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

  const Component = COMPONENT_BY_ID[item.id];
  const yaw = item.attachedYaw ?? 0;

  return (
    <group ref={groupRef} position={item.trayPosition} rotation={[0, yaw, 0]}>
      <PickableMesh
        position={[0, 0, 0]}
        onPick={handlePick}
        attached={isAttached}
        disabled={isAttached && hasAttachedPose}
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
