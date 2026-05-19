// Vitals WebSocket client.
//
// Wire format mirrors `crates/sim-server/src/wire.rs`. The stream begins
// with a `Hello` frame and continues with `VitalsFrame` messages until
// the server closes. The hook here handles auto-reconnect with capped
// exponential backoff and surfaces a discriminated state to the UI.

import { useEffect, useRef, useState } from 'react';

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

/** Whether a parsed object is a VitalsFrame. */
function isVitalsFrame(obj: unknown): obj is VitalsFrame {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.tick === 'number' && typeof o.heart_rate_bpm === 'number';
}

/**
 * React hook: subscribe to the vitals stream and return the latest frame
 * plus the connection status. Reconnects automatically.
 */
export function useVitalsStream(options: Options = {}): {
  frame: VitalsFrame | null;
  status: StreamStatus;
} {
  const url = options.url ?? DEFAULT_URL;
  const maxBackoffMs = options.maxBackoffMs ?? 5_000;
  const [frame, setFrame] = useState<VitalsFrame | null>(null);
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
        } else if (isVitalsFrame(parsed)) {
          setFrame(parsed);
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

  return { frame, status };
}
