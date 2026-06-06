// Static scenario list used when the backend is unreachable. Mirrors the
// instructor-RPC fallback pattern: when /api/* 404s, the UI carries on
// with curated client-side data instead of going dead.
//
// Scenario IDs are stable so any Zustand state keyed on them survives
// across server-up/server-down transitions. `events` are illustrative —
// the demo-mode physiology generator (lib/demoVitals.ts) doesn't actually
// step through these, but the picker UI renders them.

import type { Scenario } from '../../lib/stream';

export const DEMO_SCENARIOS: Scenario[] = [
  {
    id: 'demo-apnea-nrb',
    name: 'Apnea + Non-rebreather',
    difficulty: 'intermediate',
    duration_s: 390,
    chief_complaint: 'Unresponsive adult, shallow respirations',
    events: [
      { at_s: 0, label: 'scenario start' },
      { at_s: 60, label: 'respiratory drive falling' },
      { at_s: 180, label: 'SpO₂ < 80%' },
      { at_s: 240, label: 'SpO₂ < 50% — apply NRB' },
      { at_s: 330, label: 'recovery underway' },
    ],
  },
  {
    id: 'demo-anaphylaxis',
    name: 'Anaphylactic shock',
    difficulty: 'intermediate',
    duration_s: 300,
    chief_complaint: 'Allergic reaction with airway edema, hypotension',
    events: [
      { at_s: 0, label: 'scenario start' },
      { at_s: 45, label: 'BP falling, urticaria spreading' },
      { at_s: 90, label: 'wheezing, SpO₂ dropping' },
      { at_s: 150, label: 'IM epi indicated' },
      { at_s: 240, label: 'vitals stabilizing' },
    ],
  },
  {
    id: 'demo-stemi',
    name: 'STEMI — anterior wall',
    difficulty: 'advanced',
    duration_s: 480,
    chief_complaint: 'Crushing chest pain radiating to left arm',
    events: [
      { at_s: 0, label: 'scenario start' },
      { at_s: 30, label: 'ST elevation in V1–V4' },
      { at_s: 90, label: 'BP dropping, pre-shock' },
      { at_s: 240, label: 'PVCs and runs of VT' },
      { at_s: 360, label: 'cath lab ETA' },
    ],
  },
];
