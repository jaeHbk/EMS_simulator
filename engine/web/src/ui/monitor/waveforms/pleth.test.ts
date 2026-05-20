import { describe, expect, it } from 'vitest';
import { samplePleth } from './pleth';

describe('samplePleth', () => {
  it('stays in [0, 1]', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 10_000; i += 1) {
      const v = samplePleth(i * 0.001, 80, 0.97);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it('peaks once per cardiac cycle', () => {
    // Same approach as ECG — count up-crossings of a mid-amplitude line.
    const hr = 75;
    const expectedBeats = (hr / 60) * 5;
    let crossings = 0;
    let prev = samplePleth(0, hr, 0.97);
    for (let i = 1; i <= 5000; i += 1) {
      const v = samplePleth(i / 1000, hr, 0.97);
      if (prev < 0.4 && v >= 0.4) crossings += 1;
      prev = v;
    }
    // Pleth has one strong peak per beat; tolerance covers the lag offset.
    expect(crossings).toBeGreaterThanOrEqual(expectedBeats - 1);
    expect(crossings).toBeLessThanOrEqual(expectedBeats + 1);
  });

  it('amplitude scales with SpO2 but never collapses to flat', () => {
    const peakAt = (spo2: number): number => {
      let peak = 0;
      for (let i = 0; i < 1000; i += 1) {
        const v = samplePleth(i * 0.001, 80, spo2);
        if (v > peak) peak = v;
      }
      return peak;
    };
    expect(peakAt(0.97)).toBeGreaterThan(peakAt(0.85));
    expect(peakAt(0.40)).toBeGreaterThan(0.05); // 60% floor → still visible
  });

  it('is deterministic for fixed inputs', () => {
    expect(samplePleth(2.345, 72, 0.95)).toBe(samplePleth(2.345, 72, 0.95));
  });
});
