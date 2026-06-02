import { ConnectionStatus } from '../ConnectionStatus';
import { ScenarioPicker } from '../scenario/ScenarioPicker';
import { SettingsButton } from '../settings/SettingsButton';
import { HelpButton } from '../onboarding/HelpButton';
import { SimClock } from './SimClock';
import { useRunMode, useRateMultiplier } from '../instructor/useRunControls';
import type { TopBarSlotProps } from './Slot';

export function TopBar({ status }: TopBarSlotProps) {
  const mode = useRunMode();
  const rate = useRateMultiplier();

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <h1>EMS Simulator</h1>
      </div>
      <div className="topbar__center">
        <ScenarioPicker status={status} />
        <RunStatePill mode={mode} rate={rate} />
        <SimClock />
      </div>
      <div className="topbar__right">
        <ConnectionStatus status={status} />
        <HelpButton />
        <SettingsButton />
      </div>
    </div>
  );
}

function RunStatePill({ mode, rate }: { mode: string; rate: number }) {
  const isPaused = mode === 'paused';
  return (
    <span className={`run-pill ${isPaused ? 'run-pill--paused' : ''}`}>
      <span className="run-pill__dot" />
      <span className="run-pill__mode">
        {isPaused ? 'PAUSED' : 'LIVE'}
      </span>
      {rate !== 1 && !isPaused && (
        <span className="run-pill__rate">{rate}×</span>
      )}
    </span>
  );
}
