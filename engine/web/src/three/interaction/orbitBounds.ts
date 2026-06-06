// Single source of truth for orbit limits.
//
// Pre-Phase-A: the camera was constrained inside a sealed compartment
// so it never punched through the curb-side wall. Phase A removes the
// walls — bounds widen so the user can circle the patient and step
// closer or further back, but stay above the floor and within a sane
// camera distance.
//
// CABIN export retained as deprecated for any consumer that still
// imports it; values are now an outer "useful look-at envelope" rather
// than wall coordinates.

export const ORBIT = {
  minDistance: 0.6,
  maxDistance: 3.5,
  minPolar: 0.4, // ~23° — slightly above horizon, never looks straight down at the floor
  maxPolar: Math.PI / 2.05, // ~87.8° — never goes below floor
  minAzimuth: -Math.PI, // full revolution permitted
  maxAzimuth: Math.PI,
} as const;

/**
 * @deprecated Phase A removed the sealed compartment. Retained for any
 * consumer that has not yet been migrated; values describe a generous
 * camera-position envelope, not physical walls.
 */
export const CABIN = {
  xMin: -3.0,
  xMax: 3.0,
  yMin: 0.2,
  yMax: 2.5,
  zMin: -3.0,
  zMax: 3.0,
} as const;
