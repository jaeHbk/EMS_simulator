// Maps a VitalsFrame to deterministic, client-side patient-state cues
// suitable for driving shader uniforms. None of these require Pulse FFI;
// each is a piecewise approximation of an existing wire field.
//
// Returns refs (mutable .current) instead of state, so per-frame updates
// from the rAF clock or useFrame don't trigger React re-renders.

import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { VitalsFrame } from './stream';

export interface PatientCues {
  /** Cyanosis amount, [0, 1]. 0 = normal skin, 1 = severe cyanosis. */
  cyanosis: MutableRefObject<{ value: number }>;
  /** Pallor amount, [0, 1]. 0 = normal, 1 = ashen. */
  pallor: MutableRefObject<{ value: number }>;
}

/** React hook returning cue uniforms tied to the latest frame. Caller is
 *  expected to update uniforms each animation frame via `updateCues`. */
export function usePatientCues(): PatientCues {
  // The {value} wrapper matches Three.js IUniform semantics so the same
  // ref can be assigned directly to onBeforeCompile.
  const cyanosis = useRef({ value: 0 });
  const pallor = useRef({ value: 0 });
  return { cyanosis, pallor };
}

/** Compute cue values for a single frame and write them into the refs.
 *  Called from useFrame so React renders aren't triggered. */
export function updateCues(cues: PatientCues, frame: VitalsFrame | null): void {
  if (!frame) return;
  cues.cyanosis.current.value = cyanosisFromSpo2(frame.spo2_fraction);
  cues.pallor.current.value = pallorFromBp(
    frame.systolic_bp_mmhg,
    frame.diastolic_bp_mmhg,
  );
}

/** Piecewise approximation of cyanosis from peripheral SpO₂.
 *  Anchors: 1.00 → 0, 0.94 → 0.05, 0.88 → 0.35, 0.80 → 0.70, 0.70 → 1.0,
 *  clamped at the extremes. */
export function cyanosisFromSpo2(spo2Fraction: number): number {
  const x = clamp(spo2Fraction, 0, 1);
  if (x >= 0.94) return lerpStop(x, 1.0, 0.94, 0, 0.05);
  if (x >= 0.88) return lerpStop(x, 0.94, 0.88, 0.05, 0.35);
  if (x >= 0.80) return lerpStop(x, 0.88, 0.80, 0.35, 0.70);
  if (x >= 0.70) return lerpStop(x, 0.80, 0.70, 0.70, 1.0);
  return 1.0;
}

/** Piecewise approximation of pallor from MAP (mean arterial pressure).
 *  Hypotension makes the skin go ashen; we tie it to the lower bound of
 *  the systolic alarm threshold (90 mmHg). */
export function pallorFromBp(systolic: number, diastolic: number): number {
  const map = (systolic + 2 * diastolic) / 3;
  if (map >= 80) return 0;
  if (map <= 50) return 1;
  return (80 - map) / 30;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Linear interpolation between two anchors, with `x` somewhere in
 *  `[xHi, xLo]` (note xHi > xLo because SpO₂ falls during desaturation). */
function lerpStop(
  x: number,
  xHi: number,
  xLo: number,
  yHi: number,
  yLo: number,
): number {
  if (xHi === xLo) return yHi;
  const t = (xHi - x) / (xHi - xLo);
  return yHi + (yLo - yHi) * t;
}
