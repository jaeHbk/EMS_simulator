import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS } from './steps';

describe('ONBOARDING_STEPS', () => {
  it('has five steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(5);
  });

  it('every step has a non-empty id, title, and body', () => {
    for (const s of ONBOARDING_STEPS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique and stable', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['welcome', 'monitor', 'scene', 'treat', 'scenario']);
  });
});
