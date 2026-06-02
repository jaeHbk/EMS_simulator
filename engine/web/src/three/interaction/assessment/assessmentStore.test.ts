import { describe, expect, it, beforeEach } from 'vitest';
import { latestByRegion, useAssessmentStore } from './assessmentStore';
import type { Finding } from './findings';

const f = (finding: string): Finding => ({ title: 't', finding, detail: 'd', source: 'derived' });

describe('assessmentStore', () => {
  beforeEach(() => useAssessmentStore.getState().clear());

  it('records entries newest-first', () => {
    const { record } = useAssessmentStore.getState();
    record('chest', f('one'), 1);
    record('radial', f('two'), 2);
    const e = useAssessmentStore.getState().entries;
    expect(e[0]?.finding).toBe('two');
    expect(e[1]?.finding).toBe('one');
  });

  it('caps the log at 25 entries', () => {
    const { record } = useAssessmentStore.getState();
    for (let i = 0; i < 40; i++) record('chest', f(`n${i}`), i);
    expect(useAssessmentStore.getState().entries.length).toBe(25);
    expect(useAssessmentStore.getState().entries[0]?.finding).toBe('n39');
  });

  it('latestByRegion returns the most recent per region', () => {
    const { record } = useAssessmentStore.getState();
    record('chest', f('old-chest'), 1);
    record('radial', f('radial'), 2);
    record('chest', f('new-chest'), 3);
    const map = latestByRegion(useAssessmentStore.getState().entries);
    expect(map.get('chest')?.finding).toBe('new-chest');
    expect(map.get('radial')?.finding).toBe('radial');
  });
});
