// Top bar: brand, scenario name, sim clock, connection status. Scenario
// picker + instructor pause/rate land in week 3; the bar reserves visual
// space for them now (`--toolbar-slot`) so retro-fitting them doesn't
// reflow the chrome.

import { ConnectionStatus } from '../ConnectionStatus';
import { ScenarioPicker } from '../scenario/ScenarioPicker';
import { SettingsButton } from '../settings/SettingsButton';
import { SimClock } from './SimClock';
import type { TopBarSlotProps } from './Slot';

export function TopBar({ status }: TopBarSlotProps) {
  return (
    <div className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <h1>EMS Simulator</h1>
      </div>
      <div className="topbar__center">
        <ScenarioPicker status={status} />
        <SimClock />
      </div>
      <div className="topbar__right">
        <ConnectionStatus status={status} />
        <SettingsButton />
      </div>
    </div>
  );
}
