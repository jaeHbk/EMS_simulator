import { describe, expect, it } from 'vitest';
import { sampleResp } from './resp';

describe('sampleResp', () => {
  it('stays in [0, 1]', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 5000; i += 1) {
      const v = sampleResp(i * 0.01, 14);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it('flatlines at zero during apnea', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(sampleResp(i * 0.1, 0)).toBe(0);
    }
  });

  it('one peak per breath', () => {
    const rr = 12;
    const expected = (rr / 60) * 10;
    let crossings = 0;
    let prev = sampleResp(0, rr);
    for (let i = 1; i <= 10_000; i += 1) {
      const v = sampleResp(i / 1000, rr);
      if (prev < 0.5 && v >= 0.5) crossings += 1;
      prev = v;
    }
    expect(crossings).toBeGreaterThanOrEqual(expected - 1);
    expect(crossings).toBeLessThanOrEqual(expected + 1);
  });
});
