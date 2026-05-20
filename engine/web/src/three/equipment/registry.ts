// Static catalog of clickable equipment items. Each entry knows its
// display label, where it sits on the bench (tray pose), where it
// attaches on the patient, and what params to send on click.

export type EquipmentId =
  | 'nrb'
  | 'bvm'
  | 'iv_line'
  | 'defib_pads'
  | 'drug_box'
  | 'oxygen_tank'
  | 'intubation_kit';

export type AttachPointId =
  | 'face'
  | 'chest_anterior'
  | 'left_antecubital'
  | 'airway'
  | 'bedside';

export interface EquipmentItem {
  id: EquipmentId;
  label: string;
  attachPoint: AttachPointId;
  /** Resting pose on the bench seat: [x, y, z]. World-space. */
  trayPosition: [number, number, number];
  /** Pose when attached to the patient: [x, y, z]. World-space; null
   *  means the item stays on the bench (e.g., drug box, O2 tank). */
  attachedPosition: [number, number, number] | null;
  /** Yaw applied at the attach point, in radians. */
  attachedYaw?: number;
  /** Default params posted alongside the action. */
  defaultParams: Record<string, unknown>;
  /** Single-letter keyboard accelerator (lowercase). */
  hotkey: string;
}

// Bench seat in AmbulanceInterior: y_top ≈ 0.58, z ≈ -0.72 → +0.05 depth.
// We park items along x with y just above the cushion.
const BENCH_Y = 0.62;
const BENCH_Z = -0.55;

export const EQUIPMENT: EquipmentItem[] = [
  {
    id: 'nrb',
    label: 'Non-rebreather mask',
    attachPoint: 'face',
    trayPosition: [-1.2, BENCH_Y, BENCH_Z],
    attachedPosition: [-0.78, 1.32, 0.0],
    defaultParams: { equipment: 'nrb', attach_point: 'face', fio2: 0.85 },
    hotkey: 'n',
  },
  {
    id: 'bvm',
    label: 'Bag-valve mask',
    attachPoint: 'airway',
    trayPosition: [-0.8, BENCH_Y, BENCH_Z],
    attachedPosition: [-0.92, 1.36, 0.0],
    defaultParams: { equipment: 'bvm', attach_point: 'airway', fio2: 1.0 },
    hotkey: 'b',
  },
  {
    id: 'iv_line',
    label: 'IV line + bag',
    attachPoint: 'left_antecubital',
    trayPosition: [-0.4, BENCH_Y, BENCH_Z],
    attachedPosition: [0.6, 1.4, 0.45],
    defaultParams: {
      equipment: 'iv_line',
      attach_point: 'left_antecubital',
      rate_ml_hr: 100,
    },
    hotkey: 'i',
  },
  {
    id: 'defib_pads',
    label: 'Defibrillator pads',
    attachPoint: 'chest_anterior',
    trayPosition: [0.0, BENCH_Y, BENCH_Z],
    attachedPosition: [-0.05, 1.32, 0.0],
    defaultParams: { equipment: 'defib_pads', attach_point: 'chest_anterior' },
    hotkey: 'd',
  },
  {
    id: 'drug_box',
    label: 'Drug box',
    attachPoint: 'bedside',
    trayPosition: [0.5, BENCH_Y, BENCH_Z],
    attachedPosition: null,
    defaultParams: { equipment: 'drug_box' },
    hotkey: 'g',
  },
  {
    id: 'oxygen_tank',
    label: 'O₂ tank',
    attachPoint: 'bedside',
    trayPosition: [1.0, BENCH_Y, BENCH_Z],
    attachedPosition: null,
    defaultParams: { equipment: 'oxygen_tank' },
    hotkey: 'o',
  },
  {
    id: 'intubation_kit',
    label: 'Intubation kit',
    attachPoint: 'bedside',
    trayPosition: [1.4, BENCH_Y, BENCH_Z],
    attachedPosition: null,
    defaultParams: { equipment: 'intubation_kit' },
    hotkey: 't',
  },
];

export function findEquipment(id: EquipmentId): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
