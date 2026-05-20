// Subscribes the alarm store, evaluates rules on every fresh frame, and
// schedules audible/visual alarms with priority + silence semantics.
//
// Returns the active alarm list + the topmost priority for the banner.
// Audible side effects are kicked off here (one tone per priority level
// per cool-down window) so the visual layer can stay declarative.
//
// Selector strategy: the hook subscribes via a derived selector returning
// `topPriority` (one of high/medium/low/null). Object.is bails the React
// render unless the priority crosses a threshold — so the banner re-renders
// only on band changes, not on every 50 Hz frame. The `events` array is
// recomputed locally on each commit (cheap) and only hit when the
// priority change forces a re-render.

import { useEffect, useRef } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import { evaluateAlarms, highestPriority, type AlarmEvent, type AlarmPriority } from './rules';
import { isUnlocked, playHigh, playMedium } from '../audio/tones';

const HIGH_TONE_INTERVAL_MS = 10_000;
const MEDIUM_TONE_INTERVAL_MS = 25_000;

interface AlarmsState {
  events: AlarmEvent[];
  topPriority: AlarmPriority | null;
  silenced: boolean;
}

export function useAlarms(): AlarmsState {
  const topPriority = useMonitorStore((s) =>
    s.latest ? highestPriority(evaluateAlarms(s.latest)) : null,
  );
  const silencedUntilMs = useMonitorStore((s) => s.silencedUntilMs);

  // Recompute events on each render — only happens on priority change.
  const latest = useMonitorStore.getState().latest;
  const events: AlarmEvent[] = latest ? evaluateAlarms(latest) : [];
  const silenced = silencedUntilMs !== null && Date.now() < silencedUntilMs;

  // Audible scheduling — last play timestamp per priority level.
  const lastHighRef = useRef(0);
  const lastMediumRef = useRef(0);

  useEffect(() => {
    if (silenced || !isUnlocked() || topPriority === null) return;
    const now = Date.now();
    if (topPriority === 'high' && now - lastHighRef.current >= HIGH_TONE_INTERVAL_MS) {
      playHigh();
      lastHighRef.current = now;
    } else if (
      topPriority === 'medium' &&
      now - lastMediumRef.current >= MEDIUM_TONE_INTERVAL_MS
    ) {
      playMedium();
      lastMediumRef.current = now;
    }
  }, [topPriority, silenced]);

  return { events, topPriority, silenced };
}
