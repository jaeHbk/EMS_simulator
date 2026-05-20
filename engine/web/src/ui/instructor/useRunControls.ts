// Stub run-control RPCs. The endpoints (POST /api/run/{pause,resume,
// rate,seek,restart}) are reserved in the plan but not yet implemented
// server-side. We surface the UI now and log the intent so the rest of
// the work can land independently. When the endpoints arrive, swap each
// branch for a real fetch().

import { useMonitorStore } from '../monitor/store/monitorStore';
import type { RunMode } from '../../lib/stream';

export function useRunMode(): RunMode {
  return useMonitorStore((s) => s.latest?.run_state.mode ?? 'running');
}

export function useRateMultiplier(): number {
  return useMonitorStore((s) => s.latest?.run_state.rate_multiplier ?? 1);
}

async function postRpc(path: string, body?: unknown): Promise<void> {
  // eslint-disable-next-line no-console -- intentional dev surfacing
  console.warn(
    `[run-control] ${path} not yet implemented server-side; payload:`,
    body ?? null,
  );
  // Real impl:
  // await fetch(`/api/run/${path}`, {
  //   method: 'POST',
  //   headers: { 'content-type': 'application/json' },
  //   body: body ? JSON.stringify(body) : undefined,
  // });
}

export const runControls = {
  pause: () => postRpc('pause'),
  resume: () => postRpc('resume'),
  rate: (multiplier: number) => postRpc('rate', { multiplier }),
  seek: (sim_time_s: number) => postRpc('seek', { sim_time_s }),
  restart: () => postRpc('restart'),
};
