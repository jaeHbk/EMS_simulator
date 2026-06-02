// Hover-name bridge. 3D objects set a tooltip via useObjectTooltip; the
// single DOM ObjectTooltip element renders it. Screen coords are CSS px
// relative to the viewport.

import { create } from 'zustand';

export interface TooltipState {
  visible: boolean;
  name: string;
  hint: string;
  x: number;
  y: number;
  show: (name: string, hint: string, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
}

export const useTooltipStore = create<TooltipState>((set) => ({
  visible: false,
  name: '',
  hint: '',
  x: 0,
  y: 0,
  show: (name, hint, x, y) => set({ visible: true, name, hint, x, y }),
  move: (x, y) => set({ x, y }),
  hide: () => set({ visible: false }),
}));
