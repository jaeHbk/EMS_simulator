import type { StreamStatus } from '../lib/stream';

interface Props {
  status: StreamStatus;
}

/**
 * Connection-status pill in the top bar.
 *
 * Demo-mode awareness: when the WS feed is unavailable, lib/stream.ts
 * synthesizes vitals locally and sets `serverVersion: 'demo'`. We
 * surface that as a distinct yellow pill so the user knows the vitals
 * are synthetic, not coming from a backend.
 */
export function ConnectionStatus({ status }: Props) {
  const isDemo = status.kind === 'connected' && status.serverVersion === 'demo';

  let label: string;
  let className = 'connection';
  switch (status.kind) {
    case 'connecting':
      label = 'connecting…';
      break;
    case 'connected':
      if (isDemo) {
        label = 'demo · 50 Hz';
        className += ' demo';
      } else {
        label = `${status.tickHz} Hz`;
        className += ' connected';
      }
      break;
    case 'reconnecting':
      label = `retry ${status.attempt}…`;
      className += ' error';
      break;
    case 'error':
      label = 'offline';
      className += ' error';
      break;
  }
  return (
    <div className={className} role="status" aria-live="polite" title={fullLabel(status)}>
      <span className="dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function fullLabel(status: StreamStatus): string {
  switch (status.kind) {
    case 'connecting': return 'Connecting to simulation server…';
    case 'connected':
      return status.serverVersion === 'demo'
        ? 'Demo mode — vitals are synthesized locally because the simulation backend is unreachable. UI is fully functional; equipment actions are echoed but not propagated.'
        : `Connected · ${status.tickHz} Hz · ${status.serverVersion}`;
    case 'reconnecting': return `Reconnecting (attempt ${status.attempt}, retry in ${status.nextRetryMs}ms)`;
    case 'error': return `Connection error: ${status.message}`;
  }
}
