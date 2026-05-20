import { describe, expect, it } from 'vitest';
import { sampleCapno } from './capno';

describe('sampleCapno', () => {
  it('flatlines at zero during apnea', () => {
    for (let i = 0; i < 1000; i += 1) {
      expect(sampleCapno(i * 0.05, 0, 38)).toBe(0);
    }
  });

  it('reaches the ETCO2 target during the alveolar plateau', () => {
    const rr = 12;
    const periodSec = 60 / rr;
    // Peak should sit somewhere in phase III (35–65% of the cycle).
    let peak = 0;
    for (let i = 0; i <= 1000; i += 1) {
      const phase = (i / 1000) * periodSec;
      const v = sampleCapno(phase, rr, 38);
      if (v > peak) peak = v;
    }
    expect(peak).toBeGreaterThan(35);
    expect(peak).toBeLessThanOrEqual(38);
  });

  it('drops to zero on inspiration (phase IV → I)', () => {
    const rr = 12;
    const periodSec = 60 / rr;
    // Phase I sits at ~80% of the cycle in our split — strictly zero.
    expect(sampleCapno(periodSec * 0.85, rr, 38)).toBe(0);
  });

  it('one peak per breath cycle', () => {
    const rr = 16;
    const expectedBreaths = (rr / 60) * 6;
    let crossings = 0;
    let prev = sampleCapno(0, rr, 40);
    for (let i = 1; i <= 6000; i += 1) {
      const v = sampleCapno(i / 1000, rr, 40);
      if (prev < 20 && v >= 20) crossings += 1;
      prev = v;
    }
    expect(crossings).toBeGreaterThanOrEqual(expectedBreaths - 1);
    expect(crossings).toBeLessThanOrEqual(expectedBreaths + 1);
  });
});
