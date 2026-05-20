// Watches the latest VitalsFrame's `interventions` field and reconciles
// against the actions store. Side-effect: flips pending → confirmed, or
// rejected after timeout. Mounted once near the app root so a single
// watcher serves all consumers.

import { useEffect } from 'react';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';
import { useActionsStore } from './actions';

const RECONCILE_INTERVAL_MS = 250;

export function useInterventionsWatcher(): void {
  useEffect(() => {
    const id = window.setInterval(() => {
      const latest = useMonitorStore.getState().latest;
      if (!latest) return;
      useActionsStore.getState().reconcile(latest.interventions);
    }, RECONCILE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
}

/** Hook returning the set of equipment IDs the server currently considers
 *  attached. We treat any *confirmed* action of type `apply_equipment` as
 *  attached; pending shows optimistically. Rejected actions are removed. */
export function useAttachedEquipment(): Set<string> {
  const records = useActionsStore((s) => s.records);
  const attached = new Set<string>();
  for (const rec of records.values()) {
    if (rec.action_type !== 'apply_equipment') continue;
    if (rec.status === 'rejected') continue;
    const params = rec.params as { equipment?: string } | null;
    if (params?.equipment) attached.add(params.equipment);
  }
  return attached;
}
