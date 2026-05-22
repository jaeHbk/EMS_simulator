import { useEffect } from 'react';
import { postAction } from './actions';
import { EQUIPMENT } from '../three/equipment/registry';
import { useActionsStore } from './actions';

export function useEquipmentHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const item = EQUIPMENT.find((eq) => eq.hotkey === e.key.toLowerCase());
      if (!item) return;

      const records = useActionsStore.getState().records;
      const alreadyApplied = Array.from(records.values()).some(
        (r) =>
          r.action_type === 'apply_equipment' &&
          r.status !== 'rejected' &&
          (r.params as { equipment?: string })?.equipment === item.id,
      );
      if (alreadyApplied) return;

      e.preventDefault();
      void postAction({
        action_type: 'apply_equipment',
        params: item.defaultParams,
      });
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
