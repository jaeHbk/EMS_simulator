// Single source of truth for orbit limits and the interior shell bounds.
// Scene.tsx, the camera presets, and the preset-bounds guard test all
// import these so they cannot drift — and so the prior "camera outside
// the sealed box → flat grey frame" bug can never reappear.

export const ORBIT = {
  minDistance: 1.2,
  maxDistance: 1.7,
  minPolar: Math.PI / 3, // 60°
  maxPolar: Math.PI / 2.05, // ~87.8°
  minAzimuth: Math.PI / 3, // 60°
  maxAzimuth: Math.PI * 0.6, // 108°
} as const;

// AmbulanceInterior builds a sealed box: x∈[-1.8,1.8], z∈[-1.0,1.0],
// y∈[0,2.1]. Camera + look-at must stay strictly inside, with margin.
export const CABIN = {
  xMin: -1.7,
  xMax: 1.7,
  yMin: 0.2,
  yMax: 1.95,
  zMin: -0.9,
  zMax: 0.9,
} as const;
