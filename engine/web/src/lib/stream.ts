// Vitals WebSocket client.
//
// Wire format mirrors `crates/sim-server/src/wire.rs`. The stream begins
// with a `Hello` frame and continues with `VitalsFrame` messages until
// the server closes. The hook here handles auto-reconnect with capped
// exponential backoff and surfaces a discriminated state to the UI.

import { useEffect, useRef, useState } from 'react';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';

export interface VitalsFrame {
  tick: number;
  sim_time_s: number;
  heart_rate_bpm: number;
  systolic_bp_mmhg: number;
  diastolic_bp_mmhg: number;
  respiratory_rate_bpm: number;
  spo2_fraction: number;
  etco2_mmhg: number;
  temperature_c: number;
  /** Action IDs the server has accepted in the recent retention window.
   *  Empty in the common case; clients use this to confirm optimistic UI. */
  interventions: string[];
  /** Run state at the moment this frame was produced. */
  run_state: RunState;
}

export type RunMode = 'running' | 'paused' | 'restarting';

export interface RunState {
  mode: RunMode;
  rate_multiplier: number;
  elapsed_s: number;
}

export interface ScenarioEvent {
  at_s: number;
  label: string;
}

export interface Scenario {
  id: string;
  name: string;
  difficulty: string;
  duration_s: number;
  chief_complaint: string;
  events: ScenarioEvent[];
}

export interface ActionEnvelope {
  /** Client-generated ULID. Idempotency key. */
  action_id: string;
  action_type: string;
  params: unknown;
  client_ts_ms?: number;
}

export interface ActionAccepted {
  action_id: string;
  accepted_at_tick: number;
}

export interface Hello {
  type: 'hello';
  tick_hz: number;
  server_version: string;
  scenario: string;
}

export type StreamStatus =
  | { kind: 'connecting' }
  | { kind: 'connected'; serverVersion: string; scenario: string; tickHz: number }
  | { kind: 'reconnecting'; attempt: number; nextRetryMs: number }
  | { kind: 'error'; message: string };

interface Options {
  url?: string;
  /** Max retry backoff in ms. Default: 5_000. */
  maxBackoffMs?: number;
}

const DEFAULT_URL = (() => {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8080/api/vitals/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/vitals/ws`;
})();

/** Whether a parsed object is a Hello frame. */
function isHello(obj: unknown): obj is Hello {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { type?: unknown }).type === 'hello'
  );
}

/** Whether a parsed object is a VitalsFrame. We do NOT validate the new
 *  `interventions` / `run_state` fields strictly here — older servers may
 *  omit them. The hook normalizes missing fields below. */
function isVitalsFrame(obj: unknown): obj is Omit<VitalsFrame, 'interventions' | 'run_state'> {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.tick === 'number' && typeof o.heart_rate_bpm === 'number';
}

const DEFAULT_RUN_STATE: RunState = {
  mode: 'running',
  rate_multiplier: 1.0,
  elapsed_s: 0,
};

/** Fill defaults for forward-compat fields a server may omit. */
function normalizeFrame(parsed: unknown): VitalsFrame | null {
  if (!isVitalsFrame(parsed)) return null;
  const o = parsed as unknown as Record<string, unknown>;
  const interventions = Array.isArray(o.interventions)
    ? (o.interventions as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const rs = (o.run_state ?? null) as Record<string, unknown> | null;
  const run_state: RunState =
    rs && typeof rs.mode === 'string'
      ? {
          mode: rs.mode as RunMode,
          rate_multiplier: typeof rs.rate_multiplier === 'number' ? rs.rate_multiplier : 1.0,
          elapsed_s: typeof rs.elapsed_s === 'number' ? rs.elapsed_s : 0,
        }
      : DEFAULT_RUN_STATE;
  return { ...(parsed as Omit<VitalsFrame, 'interventions' | 'run_state'>), interventions, run_state };
}

/**
 * React hook: subscribe to the vitals stream and return the connection
 * status. Frames are pushed directly into the monitor store (no React
 * state update at 50 Hz) — consumers that need frame data subscribe to
 * the store, not to this hook. Reconnects automatically.
 */
export function useVitalsStream(options: Options = {}): {
  status: StreamStatus;
} {
  const url = options.url ?? DEFAULT_URL;
  const maxBackoffMs = options.maxBackoffMs ?? 5_000;
  const [status, setStatus] = useState<StreamStatus>({ kind: 'connecting' });
  const attemptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      setStatus(attemptRef.current === 0
        ? { kind: 'connecting' }
        : { kind: 'reconnecting', attempt: attemptRef.current, nextRetryMs: 0 });

      const ws = new WebSocket(url);
      socket = ws;
      ws.addEventListener('open', () => {
        attemptRef.current = 0;
      });
      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return; // bad JSON; ignore
        }
        if (isHello(parsed)) {
          setStatus({
            kind: 'connected',
            serverVersion: parsed.server_version,
            scenario: parsed.scenario,
            tickHz: parsed.tick_hz,
          });
        } else {
          const frame = normalizeFrame(parsed);
          if (frame !== null) {
            // Push directly to the store — bypassing React state means
            // the 50 Hz feed never triggers a render of the App tree.
            useMonitorStore.getState().pushFrame(frame);
          }
        }
      });
      ws.addEventListener('error', () => {
        // No-op here; close handler will trigger reconnect with the
        // most reliable signal.
      });
      ws.addEventListener('close', () => {
        if (cancelled) return;
        attemptRef.current += 1;
        const backoff = Math.min(maxBackoffMs, 250 * 2 ** Math.min(attemptRef.current, 6));
        const jitter = Math.random() * 250;
        const wait = Math.round(backoff + jitter);
        setStatus({
          kind: 'reconnecting',
          attempt: attemptRef.current,
          nextRetryMs: wait,
        });
        retryTimer = setTimeout(connect, wait);
      });
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [url, maxBackoffMs]);

  return { status };
}
