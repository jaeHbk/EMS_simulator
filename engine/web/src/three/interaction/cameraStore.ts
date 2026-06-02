// DOM↔Canvas bridge. The CameraBar (DOM, outside the Canvas) requests a
// preset; CameraRig (inside the Canvas) consumes it, animates, then clears.

import { create } from 'zustand';
import type { PresetId } from './cameraPresets';

interface CameraState {
  requested: PresetId | null;
  request: (id: PresetId) => void;
  clear: () => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  requested: null,
  request: (id) => set({ requested: id }),
  clear: () => set({ requested: null }),
}));
