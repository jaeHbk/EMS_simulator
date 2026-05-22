import { useVitalsStream } from './lib/stream';
import { useInterventionsWatcher } from './lib/useInterventions';
import { useEquipmentHotkeys } from './lib/useKeyboard';
import { AlarmSlot } from './ui/shell/AlarmSlot';
import { AppShell } from './ui/shell/AppShell';
import { LeftRail } from './ui/shell/LeftRail';
import { MonitorSlot } from './ui/shell/MonitorSlot';
import { SceneSlot } from './ui/shell/SceneSlot';
import { TopBar } from './ui/shell/TopBar';

export function App() {
  const { status } = useVitalsStream();
  useInterventionsWatcher();
  useEquipmentHotkeys();

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
