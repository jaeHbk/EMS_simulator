import { describe, expect, it } from 'vitest';
import type { VitalsFrame } from '../../../lib/stream';
import { deriveFinding } from './findings';

function frame(over: Partial<VitalsFrame>): VitalsFrame {
  return {
    tick: 0, sim_time_s: 0, heart_rate_bpm: 72, systolic_bp_mmhg: 120,
    diastolic_bp_mmhg: 80, respiratory_rate_bpm: 14, spo2_fraction: 0.98,
    etco2_mmhg: 38, temperature_c: 37, interventions: [],
    run_state: { mode: 'running', rate_multiplier: 1, elapsed_s: 0 },
    ...over,
  };
}

describe('deriveFinding', () => {
  it('chest: apneic when RR is zero', () => {
    const f = deriveFinding('chest', frame({ respiratory_rate_bpm: 0 }));
    expect(f.finding).toBe('No breath sounds');
    expect(f.source).toBe('derived');
  });
  it('chest: breath sounds present otherwise', () => {
    const f = deriveFinding('chest', frame({ respiratory_rate_bpm: 16 }));
    expect(f.finding).toBe('Breath sounds present');
    expect(f.detail).toContain('16');
  });
  it('radial: weak when hypoxic or hypotensive', () => {
    expect(deriveFinding('radial', frame({ spo2_fraction: 0.85 })).detail).toMatch(/weak/i);
    expect(deriveFinding('radial', frame({ systolic_bp_mmhg: 80 })).detail).toMatch(/weak/i);
    expect(deriveFinding('radial', frame({})).detail).toMatch(/strong/i);
  });
  it('radial: reports the heart rate', () => {
    expect(deriveFinding('radial', frame({ heart_rate_bpm: 142.4 })).finding).toBe('142 bpm');
  });
  it('skin: cyanotic when hypoxic, pale when hypotensive, else pink', () => {
    expect(deriveFinding('skin', frame({ spo2_fraction: 0.8 })).finding).toMatch(/cyanotic/i);
    expect(deriveFinding('skin', frame({ systolic_bp_mmhg: 80 })).finding).toMatch(/pale/i);
    expect(deriveFinding('skin', frame({})).finding).toMatch(/pink/i);
  });
  it('airway: no air movement when apneic with low ETCO2', () => {
    expect(deriveFinding('airway', frame({ respiratory_rate_bpm: 0, etco2_mmhg: 0 })).finding).toMatch(/no air/i);
    expect(deriveFinding('airway', frame({})).finding).toMatch(/patent/i);
  });
  it('pupils and carotid are labeled static notes', () => {
    expect(deriveFinding('pupils', frame({})).source).toBe('static');
    expect(deriveFinding('carotid', frame({})).source).toBe('static');
  });
});
