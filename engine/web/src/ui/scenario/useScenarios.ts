// One-shot fetch of /api/scenarios. Returns the list, a load state, and
// any error. The list is small + rarely changes; we don't bother with
// SWR-style invalidation. A retry button in ScenarioPopover re-runs.

import { useEffect, useState } from 'react';
import type { Scenario } from '../../lib/stream';

interface State {
  loading: boolean;
  scenarios: Scenario[];
  error: string | null;
}

export function useScenarios(): State & { reload: () => void } {
  const [state, setState] = useState<State>({
    loading: true,
    scenarios: [],
    error: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, scenarios: [], error: null });
    fetch('/api/scenarios')
      .then(async (r) => {
        if (!r.ok) throw new Error(`server ${r.status}`);
        return (await r.json()) as Scenario[];
      })
      .then((scenarios) => {
        if (!cancelled) setState({ loading: false, scenarios, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          scenarios: [],
          error: e instanceof Error ? e.message : 'unknown error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { ...state, reload: () => setVersion((v) => v + 1) };
}
