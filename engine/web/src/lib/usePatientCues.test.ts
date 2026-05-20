import { describe, expect, it } from 'vitest';
import { cyanosisFromSpo2, pallorFromBp } from './usePatientCues';

describe('cyanosisFromSpo2', () => {
  it('is zero at full saturation', () => {
    expect(cyanosisFromSpo2(1.0)).toBe(0);
  });
  it('rises through the medium-alarm band', () => {
    const v = cyanosisFromSpo2(0.92);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(0.3);
  });
  it('is severe below 80 percent', () => {
    expect(cyanosisFromSpo2(0.78)).toBeGreaterThan(0.7);
  });
  it('saturates at 1.0 below 70 percent', () => {
    expect(cyanosisFromSpo2(0.65)).toBe(1);
    expect(cyanosisFromSpo2(0.0)).toBe(1);
  });
  it('is monotonic decreasing in SpO2', () => {
    let prev = -1;
    for (let pct = 100; pct >= 50; pct -= 1) {
      const v = cyanosisFromSpo2(pct / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('pallorFromBp', () => {
  it('is zero at normal pressures', () => {
    expect(pallorFromBp(120, 80)).toBe(0);
  });
  it('saturates at hypotensive extremes', () => {
    expect(pallorFromBp(60, 30)).toBe(1);
  });
  it('interpolates through the shock range', () => {
    const v = pallorFromBp(80, 50); // MAP = 60
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThan(0.8);
  });
});
