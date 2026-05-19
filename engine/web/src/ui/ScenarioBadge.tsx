import type { StreamStatus } from '../lib/stream';

interface Props {
  status: StreamStatus;
}

export function ScenarioBadge({ status }: Props) {
  if (status.kind !== 'connected') return null;
  return (
    <span className="scenario" aria-label={`Active scenario ${status.scenario}`}>
      scenario: {status.scenario}
    </span>
  );
}
