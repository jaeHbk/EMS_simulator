// Priority-tiered alarm banner. Visual flash is driven by CSS animations
// (respects prefers-reduced-motion). Audible tones are scheduled by
// useAlarms; this component owns the silence button + audio unlock.

import { useEffect, useState } from 'react';
import { useMonitorStore } from './store/monitorStore';
import { useAlarms } from './alarms/useAlarms';
import { unlockAudio } from './audio/tones';

const SILENCE_MS = 2 * 60 * 1000; // 2 minutes per IEC 60601-1-8 convention

export function AlarmBanner() {
  const { events, topPriority, silenced } = useAlarms();
  const silencedUntilMs = useMonitorStore((s) => s.silencedUntilMs);
  const silenceFor = useMonitorStore((s) => s.silenceFor);
  const clearSilence = useMonitorStore((s) => s.clearSilence);

  // Coarse countdown for the silence button label. Updates every 5 s so
  // the button's aria-label doesn't re-announce every second to screen
  // readers; visual urgency is conveyed by the banner color, not the
  // exact remaining seconds.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!silenced) return;
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [silenced]);

  const idle = topPriority === null;
  const className = `alarm-banner alarm-banner--${idle ? 'idle' : topPriority}`;

  const handleSilence = (): void => {
    unlockAudio(); // user gesture — also unlocks future alarm tones
    if (silenced) clearSilence();
    else silenceFor(SILENCE_MS);
  };

  let label = 'No active alarms';
  if (!idle && events.length > 0) {
    const labels = events
      .filter((e) => e.priority === topPriority)
      .map((e) => e.label)
      .join(' · ');
    label = labels;
  }

  const remainingS = silenced && silencedUntilMs !== null
    ? Math.max(0, Math.ceil((silencedUntilMs - now) / 1000))
    : 0;

  return (
    <div
      className={className}
      role={idle ? undefined : 'alert'}
      aria-live={idle ? undefined : 'assertive'}
      aria-atomic="true"
    >
      <span className="alarm-banner__icon" aria-hidden="true">
        {priorityIcon(topPriority)}
      </span>
      <span className="alarm-banner__label">{label}</span>
      <button
        type="button"
        className="alarm-banner__silence"
        onClick={handleSilence}
        aria-pressed={silenced}
        aria-label={
          silenced
            ? `Cancel alarm silence; ${remainingS} seconds remaining`
            : 'Silence audible alarms for two minutes'
        }
      >
        {silenced ? `SILENCED ${formatMmSs(remainingS)}` : 'SILENCE'}
      </button>
    </div>
  );
}

function priorityIcon(p: ReturnType<typeof useAlarms>['topPriority']): string {
  if (p === 'high') return '▲';
  if (p === 'medium') return '■';
  if (p === 'low') return '●';
  return '·';
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
