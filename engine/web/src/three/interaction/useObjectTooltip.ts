// Returns R3F pointer handlers that publish a hover tooltip for a named
// object. Coordinates come from the native pointer event (CSS px). No
// per-frame React state — only enter/leave/move events touch the store.

import type { ThreeEvent } from '@react-three/fiber';
import { useTooltipStore } from './tooltipStore';

export function useObjectTooltip(name: string, hint: string) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>): void => {
      e.stopPropagation();
      useTooltipStore.getState().show(name, hint, e.clientX, e.clientY);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>): void => {
      useTooltipStore.getState().move(e.clientX, e.clientY);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>): void => {
      e.stopPropagation();
      useTooltipStore.getState().hide();
    },
  };
}
