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
  /** True for items with a real patient attach point (draggable onto the
   *  patient); bedside items (drug box, O₂ tank, intubation kit) are
   *  click-only because they have nowhere to land. */
  draggable: boolean;
}

// Tools sit on a single bedside table on the curb side of the stretcher
// (positive z). The table mesh is rendered in EquipmentTray; these are
// world-space positions whose height matches `EQUIPMENT_TABLE.topY` so
// every tool rests on the surface without floating or clipping.
//
// All seven tools fit in a single row spanning x ∈ [-0.9, 0.9] at
// z ≈ 1.0 — far enough from the patient (head x=-0.85, feet x=+0.95)
// that hover halos and the table itself never collide with the body.
export const EQUIPMENT_TABLE = {
  /** Centre of the table footprint in world space. */
  centerX: 0,
  centerZ: 1.0,
  /** Visible footprint. */
  width: 2.0,
  depth: 0.36,
  /** Top surface height; tray Y values are pinned to this. */
  topY: 0.78,
  /** Height of the table itself (top down to floor). */
  height: 0.78,
} as const;

const TRAY_Y = EQUIPMENT_TABLE.topY + 0.02;
const TRAY_Z = EQUIPMENT_TABLE.centerZ;
// Spread the seven items uniformly across the table width.
// Item slots: -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9.
const SLOT = (i: number): number => -0.9 + i * 0.3;

export const EQUIPMENT: EquipmentItem[] = [
  {
    id: 'nrb',
    label: 'Non-rebreather mask',
    attachPoint: 'face',
    trayPosition: [SLOT(0), TRAY_Y, TRAY_Z],
    attachedPosition: [-0.78, 1.32, 0.0],
    defaultParams: { equipment: 'nrb', attach_point: 'face', fio2: 0.85 },
    hotkey: 'n',
    draggable: true,
  },
  {
    id: 'bvm',
    label: 'Bag-valve mask',
    attachPoint: 'airway',
    trayPosition: [SLOT(1), TRAY_Y, TRAY_Z],
    attachedPosition: [-0.92, 1.36, 0.0],
    defaultParams: { equipment: 'bvm', attach_point: 'airway', fio2: 1.0 },
    hotkey: 'b',
    draggable: true,
  },
  {
    id: 'iv_line',
    label: 'IV line + bag',
    attachPoint: 'left_antecubital',
    trayPosition: [SLOT(2), TRAY_Y, TRAY_Z],
    attachedPosition: [0.6, 1.4, 0.45],
    defaultParams: {
      equipment: 'iv_line',
      attach_point: 'left_antecubital',
      rate_ml_hr: 100,
    },
    hotkey: 'i',
    draggable: true,
  },
  {
    id: 'defib_pads',
    label: 'Defibrillator pads',
    attachPoint: 'chest_anterior',
    trayPosition: [SLOT(3), TRAY_Y, TRAY_Z],
    attachedPosition: [-0.05, 1.32, 0.0],
    defaultParams: { equipment: 'defib_pads', attach_point: 'chest_anterior' },
    hotkey: 'd',
    draggable: true,
  },
  {
    id: 'drug_box',
    label: 'Drug box',
    attachPoint: 'bedside',
    trayPosition: [SLOT(4), TRAY_Y, TRAY_Z],
    attachedPosition: null,
    defaultParams: { equipment: 'drug_box' },
    hotkey: 'g',
    draggable: false,
  },
  {
    id: 'oxygen_tank',
    label: 'O₂ tank',
    attachPoint: 'bedside',
    trayPosition: [SLOT(5), TRAY_Y, TRAY_Z],
    attachedPosition: null,
    defaultParams: { equipment: 'oxygen_tank' },
    hotkey: 'o',
    draggable: false,
  },
  {
    id: 'intubation_kit',
    label: 'Intubation kit',
    attachPoint: 'bedside',
    trayPosition: [SLOT(6), TRAY_Y, TRAY_Z],
    attachedPosition: null,
    defaultParams: { equipment: 'intubation_kit' },
    hotkey: 't',
    draggable: false,
  },
];

export function findEquipment(id: EquipmentId): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
