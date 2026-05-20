// Alarm rules — pure threshold table + frame → AlarmEvent[] mapper.
//
// Adult thresholds following common EMS/AHA conventions; tunable per
// scenario in a later slice. Priority taxonomy mirrors IEC 60601-1-8:
//   high   — immediate intervention (red, fast flash, repeating tone)
//   medium — prompt attention (amber, slow flash)
//   low    — informational
//
// The mapper is deterministic and side-effect-free so it can be unit tested
// and called every render without churn.

import type { VitalsFrame } from '../../../lib/stream';

export type AlarmPriority = 'high' | 'medium' | 'low';

/** Stable key per vital channel; used for de-dup + per-channel silence. */
export type AlarmChannel =
  | 'hr'
  | 'spo2'
  | 'rr'
  | 'etco2'
  | 'sbp'
  | 'dbp'
  | 'temp';

export interface AlarmEvent {
  channel: AlarmChannel;
  priority: AlarmPriority;
  /** Short label, e.g. "SpO₂ < 90%". */
  label: string;
  /** Current numeric value of the offending vital, for display. */
  value: number;
}

/** Evaluate every channel and return the active alarm events for the
 *  given frame. Empty array means "no alarms". */
export function evaluateAlarms(frame: VitalsFrame): AlarmEvent[] {
  const out: AlarmEvent[] = [];
  const hr = frame.heart_rate_bpm;
  if (hr < 50 || hr > 130) {
    out.push({
      channel: 'hr',
      priority: 'high',
      label: hr < 50 ? 'HR < 50' : 'HR > 130',
      value: hr,
    });
  }

  const spo2Pct = frame.spo2_fraction * 100;
  if (spo2Pct < 90) {
    out.push({
      channel: 'spo2',
      priority: 'high',
      label: 'SpO₂ < 90%',
      value: spo2Pct,
    });
  } else if (spo2Pct < 94) {
    out.push({
      channel: 'spo2',
      priority: 'medium',
      label: 'SpO₂ < 94%',
      value: spo2Pct,
    });
  }

  const rr = frame.respiratory_rate_bpm;
  if (rr < 8 || rr > 30) {
    out.push({
      channel: 'rr',
      priority: 'high',
      label: rr < 8 ? 'RR < 8' : 'RR > 30',
      value: rr,
    });
  } else if (rr < 12 || rr > 24) {
    out.push({
      channel: 'rr',
      priority: 'medium',
      label: rr < 12 ? 'RR < 12' : 'RR > 24',
      value: rr,
    });
  }

  const etco2 = frame.etco2_mmhg;
  if (etco2 < 25 || etco2 > 60) {
    out.push({
      channel: 'etco2',
      priority: 'high',
      label: etco2 < 25 ? 'ETCO₂ < 25' : 'ETCO₂ > 60',
      value: etco2,
    });
  } else if (etco2 < 30 || etco2 > 50) {
    out.push({
      channel: 'etco2',
      priority: 'medium',
      label: etco2 < 30 ? 'ETCO₂ < 30' : 'ETCO₂ > 50',
      value: etco2,
    });
  }

  const sbp = frame.systolic_bp_mmhg;
  if (sbp < 90 || sbp > 180) {
    out.push({
      channel: 'sbp',
      priority: 'high',
      label: sbp < 90 ? 'SBP < 90' : 'SBP > 180',
      value: sbp,
    });
  }

  const dbp = frame.diastolic_bp_mmhg;
  if (dbp > 110) {
    out.push({
      channel: 'dbp',
      priority: 'high',
      label: 'DBP > 110',
      value: dbp,
    });
  }

  const t = frame.temperature_c;
  if (t < 34 || t > 40) {
    out.push({
      channel: 'temp',
      priority: 'high',
      label: t < 34 ? 'Temp < 34°C' : 'Temp > 40°C',
      value: t,
    });
  } else if (t < 35 || t > 38.5) {
    out.push({
      channel: 'temp',
      priority: 'medium',
      label: t < 35 ? 'Temp < 35°C' : 'Temp > 38.5°C',
      value: t,
    });
  }

  return out;
}

/** Highest-priority alarm in a list, or null. */
export function highestPriority(events: AlarmEvent[]): AlarmPriority | null {
  if (events.some((e) => e.priority === 'high')) return 'high';
  if (events.some((e) => e.priority === 'medium')) return 'medium';
  if (events.some((e) => e.priority === 'low')) return 'low';
  return null;
}
