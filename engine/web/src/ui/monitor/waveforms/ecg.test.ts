import { describe, expect, it } from 'vitest';
import { sampleEcg } from './ecg';

describe('sampleEcg', () => {
  it('produces an R-wave peak each cardiac cycle', () => {
    // At HR 60 the cycle is 1 s; sampling near the R wave (mid-cycle)
    // should pull the largest positive value within the beat.
    const hr = 60;
    const rrSec = 60 / hr;
    let peakVal = -Infinity;
    let peakAt = 0;
    for (let i = 0; i <= 1000; i += 1) {
      const t = (i / 1000) * rrSec;
      const v = sampleEcg(t, hr);
      if (v > peakVal) {
        peakVal = v;
        peakAt = t;
      }
    }
    expect(peakVal).toBeGreaterThan(0.8);
    // R wave centers each beat at ~rrSec/2 (mid-cycle).
    expect(peakAt).toBeGreaterThan(rrSec * 0.4);
    expect(peakAt).toBeLessThan(rrSec * 0.6);
  });

  it('cycles per second tracks heart rate within a tolerance', () => {
    // Count zero-up-crossings of the R wave over a 5 s window at HR 90.
    const hr = 90;
    const expectedBeats = (hr / 60) * 5;
    let crossings = 0;
    let prev = sampleEcg(0, hr);
    for (let i = 1; i <= 5000; i += 1) {
      const t = i / 1000;
      const v = sampleEcg(t, hr);
      if (prev < 0.5 && v >= 0.5) crossings += 1;
      prev = v;
    }
    // ±15% tolerance covers HRV jitter (which is intentional).
    expect(crossings).toBeGreaterThan(expectedBeats * 0.85);
    expect(crossings).toBeLessThan(expectedBeats * 1.15);
  });

  it('clamps physiologically extreme heart rates without exploding', () => {
    expect(Number.isFinite(sampleEcg(1.0, 0))).toBe(true);
    expect(Number.isFinite(sampleEcg(1.0, 9999))).toBe(true);
  });

  it('is bounded in a sensible range', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 10_000; i += 1) {
      const v = sampleEcg(i * 0.001, 75);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(hi).toBeLessThan(1.5);
    expect(lo).toBeGreaterThan(-0.6);
  });

  it('is deterministic for fixed (t, hr)', () => {
    expect(sampleEcg(1.234, 72)).toBe(sampleEcg(1.234, 72));
  });
});
