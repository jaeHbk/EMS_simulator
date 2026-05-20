// Throttled aria-live="polite" region for screen readers.
//
// Replaces per-tile aria-live (which spammed at 6 Hz). This component
// emits a plain-English summary of *abnormal* vitals every 10 s, but
// only when the band-state has changed since the previous announcement.
// Screen readers thus get a "SpO2 falling, now 88 percent" kind of
// update on a human cadence, not every digit change.

import { useEffect, useRef, useState } from 'react';
import { useMonitorStore } from './store/monitorStore';
import { evaluateAlarms } from './alarms/rules';

const ANNOUNCE_INTERVAL_MS = 10_000;

export function VitalsAnnouncer() {
  const [message, setMessage] = useState('');
  const lastSummaryRef = useRef('');

  useEffect(() => {
    const tick = (): void => {
      const f = useMonitorStore.getState().latest;
      if (!f) return;
      const events = evaluateAlarms(f);
      let summary = '';
      if (events.length === 0) {
        summary = 'All vitals within range.';
      } else {
        const labels = events
          .filter((e) => e.priority !== 'low')
          .map((e) => `${e.label} (${formatValue(e.label, e.value)})`);
        summary = labels.join('; ');
      }
      if (summary !== lastSummaryRef.current) {
        lastSummaryRef.current = summary;
        setMessage(summary);
      }
    };
    tick();
    const id = window.setInterval(tick, ANNOUNCE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div role="status" aria-live="polite" className="visually-hidden">
      {message}
    </div>
  );
}

function formatValue(label: string, value: number): string {
  // The label embeds the rule (e.g., "SpO₂ < 90%"); we just need a sane
  // numeric for SR. Round all but temperature to whole numbers.
  if (/temp/i.test(label)) return `${value.toFixed(1)}°C`;
  return `${Math.round(value)}`;
}
