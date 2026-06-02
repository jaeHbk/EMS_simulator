import type { RegionId } from './findings';

export interface Hotspot {
  id: RegionId;
  label: string;
  /** Local-space anchor within the patient group (Scene applies the
   *  group's [0,0,-0.15] offset). Placed on the patient's body to match
   *  Patient.tsx geometry: head ≈ [-0.72, 1.46], chest ≈ [-0.2, 1.24],
   *  right hand ≈ [0.28, 1.14, 0.32]. */
  anchor: [number, number, number];
}

export const HOTSPOTS: readonly Hotspot[] = [
  { id: 'pupils', label: 'Pupils', anchor: [-0.72, 1.48, 0.1] },
  { id: 'airway', label: 'Airway', anchor: [-0.6, 1.4, 0] },
  { id: 'carotid', label: 'Carotid pulse', anchor: [-0.55, 1.34, 0.07] },
  { id: 'chest', label: 'Chest', anchor: [-0.2, 1.44, 0] },
  { id: 'radial', label: 'Radial pulse', anchor: [0.28, 1.16, 0.32] },
  { id: 'skin', label: 'Skin', anchor: [0.0, 1.18, 0.22] },
];
