// Wraps a 3D group with hover affordance + click-to-pick + keyboard
// equivalence. The DOM-side <button> overlay (drei <Html>) carries the
// accessible name and receives the click for keyboard/screen-reader
// users; visual hover halo is on the 3D side for mouse users.

import { Html, useCursor } from '@react-three/drei';
import { useState, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

interface Props {
  /** Position the item is rendered at in world space. */
  position: [number, number, number];
  /** Children meshes that compose the item. */
  children: ReactNode;
  /** Whether the item is currently in an interactive state. Disabled items
   *  don't show hover affordance and don't dispatch clicks. */
  disabled?: boolean;
  /** Whether the item is currently attached to the patient (visual only;
   *  used by callers to disable picking after first click). */
  attached?: boolean;
  /** Click handler. */
  onPick: () => void;
  /** A11y label. */
  label: string;
}

export function PickableMesh({
  position,
  children,
  disabled = false,
  attached = false,
  onPick,
  label,
}: Props) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && !disabled);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    if (!disabled) setHovered(true);
  };
  const handlePointerOut = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    setHovered(false);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (disabled) return;
    onPick();
  };

  // The Html-overlay button is invisible to mouse users (pointer-events
  // off, opacity 0) but receives focus via Tab and triggers onPick on
  // Space/Enter. Without it, equipment is fully inaccessible by keyboard.
  return (
    <group
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {children}
      {hovered && !disabled && <HoverHalo />}
      {attached && <AttachedDot />}
      <Html
        center
        distanceFactor={6}
        zIndexRange={[0, 0]}
        wrapperClass="equipment-a11y"
      >
        <button
          type="button"
          className="equipment-a11y__btn"
          aria-label={
            disabled
              ? `${label} (already attached)`
              : attached
                ? `${label} (attached)`
                : `Apply ${label}`
          }
          aria-pressed={attached}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onPick();
          }}
        >
          {label}
        </button>
      </Html>
    </group>
  );
}

/** A subtle pulsing ring on the floor under the item to mark hover. */
function HoverHalo() {
  return (
    <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.12, 0.16, 24]} />
      <meshBasicMaterial color="#34d3a3" transparent opacity={0.6} />
    </mesh>
  );
}

/** A small green dot near the item to signal "this is currently attached". */
function AttachedDot() {
  return (
    <mesh position={[0, 0.18, 0]}>
      <sphereGeometry args={[0.025, 12, 12]} />
      <meshBasicMaterial color="#34d3a3" />
    </mesh>
  );
}
