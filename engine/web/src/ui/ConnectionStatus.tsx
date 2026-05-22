import type { StreamStatus } from '../lib/stream';

interface Props {
  status: StreamStatus;
}

export function ConnectionStatus({ status }: Props) {
  let label: string;
  let className = 'connection';
  switch (status.kind) {
    case 'connecting':
      label = 'connecting…';
      break;
    case 'connected':
      label = `${status.tickHz} Hz`;
      className += ' connected';
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
    case 'connected': return `Connected · ${status.tickHz} Hz · ${status.serverVersion}`;
    case 'reconnecting': return `Reconnecting (attempt ${status.attempt}, retry in ${status.nextRetryMs}ms)`;
    case 'error': return `Connection error: ${status.message}`;
  }
}
