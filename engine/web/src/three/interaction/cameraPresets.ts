// Named camera viewpoints. Each is stored as a spherical pose (distance,
// azimuth, polar) relative to a look-at target, all within ORBIT bounds so
// OrbitControls (makeDefault) accepts the final pose without snapping.

export type PresetId = 'reset' | 'fullBody' | 'airway' | 'monitor';

export interface CameraPreset {
  id: PresetId;
  label: string;
  target: [number, number, number];
  distance: number;
  azimuth: number;
  polar: number;
}

export const PRESET_ORDER: readonly PresetId[] = ['airway', 'monitor', 'fullBody', 'reset'];

export const CAMERA_PRESETS: Record<PresetId, CameraPreset> = {
  reset: { id: 'reset', label: 'Reset', target: [0, 1.0, 0], distance: 1.7, azimuth: 1.094, polar: 1.218 },
  fullBody: { id: 'fullBody', label: 'Full body', target: [0, 1.05, 0], distance: 1.7, azimuth: 1.1, polar: 1.25 },
  airway: { id: 'airway', label: 'Airway', target: [-0.7, 1.3, 0], distance: 1.2, azimuth: 1.15, polar: 1.2 },
  monitor: { id: 'monitor', label: 'Monitor', target: [-0.9, 1.3, 0.25], distance: 1.35, azimuth: 1.07, polar: 1.3 },
};

/** Convert a preset's spherical pose to a world-space camera position,
 *  using three.js' Spherical convention (phi from +Y, theta from +Z). */
export function presetToPosition(p: CameraPreset): [number, number, number] {
  const sinPhi = Math.sin(p.polar);
  return [
    p.target[0] + p.distance * sinPhi * Math.sin(p.azimuth),
    p.target[1] + p.distance * Math.cos(p.polar),
    p.target[2] + p.distance * sinPhi * Math.cos(p.azimuth),
  ];
}
