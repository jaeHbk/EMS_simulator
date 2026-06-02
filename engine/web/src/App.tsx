import { useEffect } from 'react';
import { useVitalsStream } from './lib/stream';
import { useInterventionsWatcher } from './lib/useInterventions';
import { useEquipmentHotkeys } from './lib/useKeyboard';
import { AlarmSlot } from './ui/shell/AlarmSlot';
import { AppShell } from './ui/shell/AppShell';
import { LeftRail } from './ui/shell/LeftRail';
import { MonitorSlot } from './ui/shell/MonitorSlot';
import { SceneSlot } from './ui/shell/SceneSlot';
import { TopBar } from './ui/shell/TopBar';
import { OnboardingWizard } from './ui/onboarding/OnboardingWizard';
import { useOnboarding } from './ui/onboarding/useOnboarding';

export function App() {
  const { status } = useVitalsStream();
  useInterventionsWatcher();
  useEquipmentHotkeys();

  // Auto-open the tour on genuine first run only.
  const open = useOnboarding((s) => s.open);
  useEffect(() => {
    if (useOnboarding.getState().shouldAutoOpen()) open();
  }, [open]);

  return (
    <>
      <AppShell
        top={<TopBar status={status} />}
        left={<LeftRail />}
        center={<SceneSlot />}
        right={<MonitorSlot status={status} />}
        bottom={<AlarmSlot />}
      />
      <OnboardingWizard />
    </>
  );
}
