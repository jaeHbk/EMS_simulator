import { describe, expect, it } from 'vitest';
import { newActionId, useActionsStore } from './actions';

describe('newActionId', () => {
  it('produces a 26-character Crockford-base32 string', () => {
    const id = newActionId();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{26}$/);
  });

  it('is unique across rapid invocations', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) ids.add(newActionId());
    expect(ids.size).toBe(1000);
  });

  it('time prefix sorts roughly by creation order', () => {
    const a = newActionId();
    const b = newActionId();
    // Same ms tick is possible; we only assert non-decreasing.
    expect(a.slice(0, 10) <= b.slice(0, 10)).toBe(true);
  });
});

describe('useActionsStore.reconcile', () => {
  it('flips pending to confirmed when echoed', () => {
    const { upsert, reconcile } = useActionsStore.getState();
    upsert({
      action_id: 'A',
      action_type: 'apply_equipment',
      params: { equipment: 'nrb' },
      status: 'pending',
      sentAtMs: Date.now(),
    });
    reconcile(['A']);
    expect(useActionsStore.getState().records.get('A')?.status).toBe(
      'confirmed',
    );
  });

  it('rejects pending actions after timeout', () => {
    const { upsert, reconcile } = useActionsStore.getState();
    upsert({
      action_id: 'B',
      action_type: 'apply_equipment',
      params: { equipment: 'bvm' },
      status: 'pending',
      sentAtMs: Date.now() - 10_000, // > 5 s timeout
    });
    reconcile([]);
    expect(useActionsStore.getState().records.get('B')?.status).toBe(
      'rejected',
    );
  });

  it('leaves confirmed actions alone within the retention window', () => {
    const { upsert, reconcile } = useActionsStore.getState();
    upsert({
      action_id: 'C',
      action_type: 'apply_equipment',
      params: {},
      status: 'confirmed',
      sentAtMs: Date.now(),
    });
    reconcile([]);
    expect(useActionsStore.getState().records.get('C')?.status).toBe(
      'confirmed',
    );
  });

  it('prunes old confirmed/rejected records past 60 s', () => {
    const { upsert, reconcile } = useActionsStore.getState();
    upsert({
      action_id: 'D',
      action_type: 'apply_equipment',
      params: {},
      status: 'confirmed',
      sentAtMs: Date.now() - 90_000,
    });
    upsert({
      action_id: 'E',
      action_type: 'apply_equipment',
      params: {},
      status: 'rejected',
      sentAtMs: Date.now() - 90_000,
    });
    reconcile([]);
    expect(useActionsStore.getState().records.has('D')).toBe(false);
    expect(useActionsStore.getState().records.has('E')).toBe(false);
  });
});
