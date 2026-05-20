import { describe, expect, it } from 'vitest';
import type { VitalsFrame } from '../../../lib/stream';
import { evaluateAlarms, highestPriority } from './rules';

const baseline: VitalsFrame = {
  tick: 0,
  sim_time_s: 0,
  heart_rate_bpm: 80,
  systolic_bp_mmhg: 120,
  diastolic_bp_mmhg: 75,
  respiratory_rate_bpm: 14,
  spo2_fraction: 0.97,
  etco2_mmhg: 38,
  temperature_c: 36.8,
  interventions: [],
  run_state: { mode: 'running', rate_multiplier: 1, elapsed_s: 0 },
};

describe('evaluateAlarms', () => {
  it('returns no events for a healthy baseline', () => {
    expect(evaluateAlarms(baseline)).toEqual([]);
  });

  it('flags SpO2 < 90 as high priority', () => {
    const events = evaluateAlarms({ ...baseline, spo2_fraction: 0.85 });
    expect(events).toHaveLength(1);
    expect(events[0]?.priority).toBe('high');
    expect(events[0]?.channel).toBe('spo2');
  });

  it('flags SpO2 in [90, 94) as medium priority', () => {
    const events = evaluateAlarms({ ...baseline, spo2_fraction: 0.92 });
    expect(events[0]?.priority).toBe('medium');
  });

  it('flags HR > 130 high', () => {
    const events = evaluateAlarms({ ...baseline, heart_rate_bpm: 145 });
    expect(events.find((e) => e.channel === 'hr')?.priority).toBe('high');
  });

  it('returns multiple events when multiple channels alarm', () => {
    const events = evaluateAlarms({
      ...baseline,
      spo2_fraction: 0.85,
      heart_rate_bpm: 40,
      respiratory_rate_bpm: 4,
    });
    expect(events.length).toBeGreaterThanOrEqual(3);
  });
});

describe('highestPriority', () => {
  it('returns null for empty list', () => {
    expect(highestPriority([])).toBe(null);
  });
  it('returns high when any high present', () => {
    expect(
      highestPriority([
        { channel: 'hr', priority: 'medium', label: '', value: 0 },
        { channel: 'spo2', priority: 'high', label: '', value: 0 },
      ]),
    ).toBe('high');
  });
});
