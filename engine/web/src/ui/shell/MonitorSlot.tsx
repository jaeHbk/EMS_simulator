// MonitorSlot now hosts the full clinical monitor (waveforms + numeric
// tiles + trend strips). It reads from the monitor store directly; the
// status prop is reserved for a future "no signal" overlay.

import { MonitorShell } from '../monitor/MonitorShell';
import type { MonitorSlotProps } from './Slot';

export function MonitorSlot(_: MonitorSlotProps) {
  return <MonitorShell />;
}
