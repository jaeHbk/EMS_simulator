// Typed slot contracts. Each later slice (monitor, scene, instructor) ships
// a component matching the props here; AppShell renders whatever is mounted
// into the slot. Frames live in the monitor store — slots take only the
// connection status (low-frequency) so the App tree never re-renders on
// the 50 Hz vitals feed.

import type { ReactNode } from 'react';
import type { StreamStatus } from '../../lib/stream';

export interface SceneSlotProps {
  // Reserved for future per-scene options (e.g., camera presets); the
  // patient frame is read from the monitor store inside the scene.
  _reserved?: never;
}

export interface MonitorSlotProps {
  status: StreamStatus;
}

export interface AlarmSlotProps {
  _reserved?: never;
}

export interface TopBarSlotProps {
  status: StreamStatus;
}

export interface LeftRailSlotProps {
  _reserved?: never;
}

/** Render-prop slot. A slot is a function so the shell can pass typed props
 *  without leaking the implementation's free choice of state library. */
export type Slot<P> = ((props: P) => ReactNode) | null;
