// Single source of truth for asset URLs. Renaming any blob is a one-line
// change. Components import from here only — never inline a URL.
//
// All paths are absolute URLs (Vite serves `public/` at site root) so
// drei's loaders can fetch them under both dev (vite) and prod (any
// static host).

export const ASSET_PATHS = {
  hdri: {
    clinicalRoom: '/assets/hdri/clinical-room-1k.hdr',
  },
  patient: '/assets/patient/patient-supine.glb',
  equipment: {
    defibrillator: '/assets/equipment/defibrillator.glb',
    ivPole: '/assets/equipment/iv-pole.glb',
    bvm: '/assets/equipment/bvm.glb',
    nrbMask: '/assets/equipment/nrb-mask.glb',
    intubationKit: '/assets/equipment/intubation-kit.glb',
    drugBox: '/assets/equipment/drug-box.glb',
    oxygenTank: '/assets/equipment/oxygen-tank.glb',
    monitorBedside: '/assets/equipment/monitor-bedside.glb',
  },
  floor: {
    albedo: '/assets/floor/floor-albedo.jpg',
    normal: '/assets/floor/floor-normal.jpg',
    roughness: '/assets/floor/floor-roughness.jpg',
  },
} as const;
