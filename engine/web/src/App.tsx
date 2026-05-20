import { useVitalsStream } from './lib/stream';
import { useInterventionsWatcher } from './lib/useInterventions';
import { AlarmSlot } from './ui/shell/AlarmSlot';
import { AppShell } from './ui/shell/AppShell';
import { LeftRail } from './ui/shell/LeftRail';
import { MonitorSlot } from './ui/shell/MonitorSlot';
import { SceneSlot } from './ui/shell/SceneSlot';
import { TopBar } from './ui/shell/TopBar';

export function App() {
  // Frames are pushed straight into the monitor store; only `status`
  // (low-frequency) flows through React state.
  const { status } = useVitalsStream();
  useInterventionsWatcher();

  return (
    <AppShell
      top={<TopBar status={status} />}
      left={<LeftRail />}
      center={<SceneSlot />}
      right={<MonitorSlot status={status} />}
      bottom={<AlarmSlot />}
    />
  );
}
