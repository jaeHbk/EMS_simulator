// Watches the latest VitalsFrame's `interventions` field and reconciles
// against the actions store. Side-effect: flips pending → confirmed, or
// rejected after timeout. Mounted once near the app root so a single
// watcher serves all consumers.

import { useEffect } from 'react';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';
import { attachedFromRecords, useActionsStore } from './actions';

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

/** Hook returning the set of equipment IDs currently attached. Delegates to
 *  the pure `attachedFromRecords` reducer: the most-recent non-rejected
 *  apply/remove action per equipment wins, so a detach reverts the attached
 *  state and pending actions still show optimistically. */
export function useAttachedEquipment(): Set<string> {
  const records = useActionsStore((s) => s.records);
  return attachedFromRecords(records.values());
}
