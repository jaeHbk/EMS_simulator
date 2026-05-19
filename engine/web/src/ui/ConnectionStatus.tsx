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
      label = `live · ${status.tickHz} Hz · ${status.serverVersion}`;
      className += ' connected';
      break;
    case 'reconnecting':
      label = `reconnecting (attempt ${status.attempt})…`;
      className += ' error';
      break;
    case 'error':
      label = `error: ${status.message}`;
      className += ' error';
      break;
  }
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
