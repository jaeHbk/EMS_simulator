// Scenario elapsed time, mm:ss formatted with tabular numerals so digits
// don't jitter. Reads the store with an integer-second selector so it
// only re-renders ~1×/s, not 50×/s.

import { useMonitorStore } from '../monitor/store/monitorStore';

export function SimClock() {
  const wholeSeconds = useMonitorStore((s) =>
    Math.floor(s.latest?.sim_time_s ?? 0),
  );
  const m = Math.floor(wholeSeconds / 60);
  const s = wholeSeconds % 60;
  const label = `${pad2(m)}:${pad2(s)}`;
  return (
    <span className="sim-clock" aria-label={`Sim time ${m} minutes ${s} seconds`}>
      <span className="sim-clock__icon" aria-hidden="true">T+</span>
      <span className="sim-clock__time">{label}</span>
    </span>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
