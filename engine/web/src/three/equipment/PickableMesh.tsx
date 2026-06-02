// Wraps a 3D group with hover affordance + click-to-pick + keyboard
// equivalence, plus optional press-drag-release (for items with a real
// patient attach point) and a detach handle when attached.
//
// The DOM-side <button> overlay (drei <Html>) carries the accessible name
// and receives the click for keyboard/screen-reader users; the visual
// hover halo is on the 3D side for mouse users. Drag is an affordance, not
// a free-positioning gesture — the item snaps to its attach pose on release.

import { Html, useCursor } from '@react-three/drei';
import { useRef, useState, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

interface Props {
  /** Position the item is rendered at in world space. */
  position: [number, number, number];
  /** Children meshes that compose the item. */
  children: ReactNode;
  /** Whether the item is currently in an interactive state. Disabled items
   *  don't show hover affordance and don't dispatch clicks. */
  disabled?: boolean;
  /** Whether the item is currently attached to the patient. */
  attached?: boolean;
  /** Allow press-drag-release to apply (in addition to click). */
  draggable?: boolean;
  /** Click/drag-release handler (apply). */
  onPick: () => void;
  /** Called when the user removes an attached item. */
  onDetach?: () => void;
  /** A11y label. */
  label: string;
}

const DRAG_THRESHOLD_PX = 6;

export function PickableMesh({
  position,
  children,
  disabled = false,
  attached = false,
  draggable = false,
  onPick,
  onDetach,
  label,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  useCursor(hovered && !disabled);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    if (!disabled) setHovered(true);
  };
  const handlePointerOut = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    setHovered(false);
  };
  const handlePointerDown = (e: ThreeEvent<PointerEvent>): void => {
    if (disabled) return;
    e.stopPropagation();
    downAt.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;
    // Capture the pointer so move/up keep firing on this mesh even when the
    // cursor drags off it — otherwise a drag-release lands on whatever is
    // underneath and onPick never runs.
    if (draggable) {
      (e.target as Element | undefined)?.setPointerCapture?.(e.pointerId);
    }
  };
  const handlePointerMove = (e: ThreeEvent<PointerEvent>): void => {
    if (!downAt.current || !draggable) return;
    const dx = e.clientX - downAt.current.x;
    const dy = e.clientY - downAt.current.y;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      dragging.current = true;
      setHovered(true);
    }
  };
  const handlePointerUp = (e: ThreeEvent<PointerEvent>): void => {
    if (disabled || !downAt.current) return;
    e.stopPropagation();
    downAt.current = null;
    if (draggable) {
      (e.target as Element | undefined)?.releasePointerCapture?.(e.pointerId);
    }
    // Click OR drag-release both apply (the drag is an affordance, not a
    // free-positioning gesture — the item snaps to its attach pose).
    if (!attached) onPick();
    dragging.current = false;
  };

  return (
    <group
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {children}
      {hovered && !disabled && <HoverHalo />}
      {attached && <AttachedDot />}
      <Html center distanceFactor={6} zIndexRange={[0, 0]} wrapperClass="equipment-a11y">
        {attached && onDetach ? (
          <button
            type="button"
            className="equipment-a11y__btn equipment-detach"
            aria-label={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onDetach();
            }}
          >
            ✕ Remove {label}
          </button>
        ) : (
          <button
            type="button"
            className="equipment-a11y__btn"
            aria-label={disabled ? `${label} (already attached)` : `Apply ${label}`}
            aria-pressed={attached}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onPick();
            }}
          >
            {label}
          </button>
        )}
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
