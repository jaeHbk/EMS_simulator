// Run-control RPCs. Tries the server endpoint first; if it 404s (not yet
// implemented), falls back to client-side store overrides so the UI stays
// interactive even without the backend RPCs.

import { create } from 'zustand';
import { useMonitorStore } from '../monitor/store/monitorStore';
import type { RunMode } from '../../lib/stream';

interface RunOverrides {
  modeOverride: RunMode | null;
  rateOverride: number | null;
  setMode: (mode: RunMode | null) => void;
  setRate: (rate: number | null) => void;
}

export const useRunOverrides = create<RunOverrides>((set) => ({
  modeOverride: null,
  rateOverride: null,
  setMode: (mode) => set({ modeOverride: mode }),
  setRate: (rate) => set({ rateOverride: rate }),
}));

export function useRunMode(): RunMode {
  const override = useRunOverrides((s) => s.modeOverride);
  const serverMode = useMonitorStore((s) => s.latest?.run_state.mode ?? 'running');
  return override ?? serverMode;
}

export function useRateMultiplier(): number {
  const override = useRunOverrides((s) => s.rateOverride);
  const serverRate = useMonitorStore((s) => s.latest?.run_state.rate_multiplier ?? 1);
  return override ?? serverRate;
}

async function postRpc(path: string, body?: unknown): Promise<boolean> {
  try {
    const resp = await fetch(`/api/run/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (resp.ok) return true;
    return false;
  } catch {
    return false;
  }
}

export const runControls = {
  pause: async () => {
    const ok = await postRpc('pause');
    if (!ok) useRunOverrides.getState().setMode('paused');
  },
  resume: async () => {
    const ok = await postRpc('resume');
    if (!ok) useRunOverrides.getState().setMode('running');
  },
  rate: async (multiplier: number) => {
    const ok = await postRpc('rate', { multiplier });
    if (!ok) useRunOverrides.getState().setRate(multiplier);
  },
  seek: async (sim_time_s: number) => {
    await postRpc('seek', { sim_time_s });
  },
  restart: async () => {
    const ok = await postRpc('restart');
    if (!ok) {
      useRunOverrides.getState().setMode('running');
      useRunOverrides.getState().setRate(1);
      useMonitorStore.getState().resetHistory();
    }
  },
};
