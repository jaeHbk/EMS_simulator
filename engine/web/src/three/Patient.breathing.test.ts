// Unit test for the chest-scale breathing curve. We test the pure
// computation, not the React/R3F integration — the project convention
// (see usePatientCues.test.ts) is to extract the math from the hook
// into a tiny function and unit-test it directly. Avoids needing
// @testing-library/react or jsdom (CLAUDE.md "no new npm deps").

import { describe, expect, it } from 'vitest';
import { computeBreathScale } from './Patient';

describe('computeBreathScale', () => {
  it('returns 1.0 (no breath) when respiratory rate is undefined', () => {
    expect(computeBreathScale({ phaseRad: 0, rrBpm: undefined })).toBeCloseTo(1.0, 3);
    expect(computeBreathScale({ phaseRad: Math.PI, rrBpm: undefined })).toBeCloseTo(1.0, 3);
  });

  it('returns 1.0 at the start of the cycle (phase = 0)', () => {
    expect(computeBreathScale({ phaseRad: 0, rrBpm: 12 })).toBeCloseTo(1.0, 3);
  });

  it('peaks above 1.0 during inhale (phase = pi/3, ~peak inhale)', () => {
    const peak = computeBreathScale({ phaseRad: Math.PI / 3, rrBpm: 12 });
    expect(peak).toBeGreaterThan(1.0);
  });

  it('returns to ~1.0 by end of exhale', () => {
    const exhaleEnd = computeBreathScale({ phaseRad: Math.PI * 1.95, rrBpm: 12 });
    expect(exhaleEnd).toBeCloseTo(1.0, 1);
  });

  it('amplitude grows with respiratory rate up to a cap', () => {
    const lo = computeBreathScale({ phaseRad: Math.PI / 3, rrBpm: 6 });
    const hi = computeBreathScale({ phaseRad: Math.PI / 3, rrBpm: 24 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('handles negative phase by wrapping into [0, 2pi)', () => {
    const a = computeBreathScale({ phaseRad: -Math.PI / 3, rrBpm: 12 });
    const b = computeBreathScale({ phaseRad: -Math.PI / 3 + Math.PI * 2, rrBpm: 12 });
    expect(a).toBeCloseTo(b, 6);
  });
});
