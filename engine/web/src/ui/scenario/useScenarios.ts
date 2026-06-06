// One-shot fetch of /api/scenarios. Returns the list, a load state, and
// any error. The list is small + rarely changes; we don't bother with
// SWR-style invalidation. A retry button in ScenarioPopover re-runs.
//
// Server-down behavior: when the fetch fails (404 / connection refused /
// HTML SPA-fallback), we substitute a curated demo scenario list so the
// picker stays usable. Mirrors the demo-mode pattern in lib/stream.ts
// (fall back to synthesized vitals after 3 WS failures) and the
// instructor-RPC fallback (client-side run-state when /api/run 404s).
// `error` is still populated so the UI can show a soft notice.

import { useEffect, useState } from 'react';
import type { Scenario } from '../../lib/stream';
import { DEMO_SCENARIOS } from './demoScenarios';

interface State {
  loading: boolean;
  scenarios: Scenario[];
  error: string | null;
  /** True when the list came from DEMO_SCENARIOS, not the backend. */
  isDemo: boolean;
}

function looksLikeJsonArray(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.startsWith('[');
}

export function useScenarios(): State & { reload: () => void } {
  const [state, setState] = useState<State>({
    loading: true,
    scenarios: [],
    error: null,
    isDemo: false,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, scenarios: [], error: null, isDemo: false });
    fetch('/api/scenarios')
      .then(async (r) => {
        if (!r.ok) throw new Error(`server ${r.status}`);
        // Vite dev returns the SPA fallback HTML (200 OK, text/html) for
        // unproxied / unmatched paths. Detect that and treat as failure.
        const text = await r.text();
        if (!looksLikeJsonArray(text)) {
          throw new Error('non-JSON response');
        }
        return JSON.parse(text) as Scenario[];
      })
      .then((scenarios) => {
        if (!cancelled) {
          setState({ loading: false, scenarios, error: null, isDemo: false });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          scenarios: DEMO_SCENARIOS,
          error: e instanceof Error ? e.message : 'unknown error',
          isDemo: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { ...state, reload: () => setVersion((v) => v + 1) };
}
