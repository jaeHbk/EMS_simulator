// Zustand store for monitor-side state. The store sits OUTSIDE React's
// reconciler so the 50 Hz vitals feed doesn't re-render the tree on every
// sample — components subscribe via selectors keyed on band changes only.
//
// Two distinct concerns share this store:
//   1. Ring buffers per vital (mutated in place; readers re-render when a
//      derived band crosses a threshold, NOT on every push).
//   2. Alarm silence + UI flags that genuinely change discretely.

import { create } from 'zustand';
import type { VitalsFrame } from '../../../lib/stream';
import { createRing, pushRing, type RingBuffer } from './ringBuffer';

/** Window options the trend strips offer. Server tick is ~50 Hz so even
 *  the longest window stays modest in memory. */
export const TREND_WINDOWS_S = [30, 60, 300] as const;
export type TrendWindowS = (typeof TREND_WINDOWS_S)[number];

const TICKS_PER_SECOND = 50;
// Largest trend window the UI offers; ring capacity is derived from this
// so even the longest sparkline stays in-buffer.
const MAX_WINDOW_S = 300;
const RING_CAPACITY = TICKS_PER_SECOND * MAX_WINDOW_S;

type VitalKey =
  | 'heart_rate_bpm'
  | 'spo2_fraction'
  | 'respiratory_rate_bpm'
  | 'etco2_mmhg'
  | 'systolic_bp_mmhg'
  | 'diastolic_bp_mmhg'
  | 'temperature_c';

const VITAL_KEYS: readonly VitalKey[] = [
  'heart_rate_bpm',
  'spo2_fraction',
  'respiratory_rate_bpm',
  'etco2_mmhg',
  'systolic_bp_mmhg',
  'diastolic_bp_mmhg',
  'temperature_c',
];

export type Rings = Readonly<Record<VitalKey, RingBuffer>>;

interface MonitorState {
  /** Latest frame received. Mutated in place is forbidden — replace the
   *  reference whenever a new frame lands. */
  latest: VitalsFrame | null;
  /** Last sim_time_s recorded; used to detect server resets / scenario
   *  switches and clear ring history. */
  lastSimTime: number;
  /** Per-vital ring buffers. The reference is stable (created once). */
  rings: Rings;
  /** Currently selected trend window. */
  trendWindowS: TrendWindowS;
  /** Epoch ms after which alarm audio is no longer silenced (null = not
   *  silenced). Persisted to sessionStorage in slice-2 work. */
  silencedUntilMs: number | null;

  /** Push a frame; updates `latest` and appends to every ring. */
  pushFrame: (frame: VitalsFrame) => void;
  /** Clear ring history (e.g., scenario reset). */
  resetHistory: () => void;
  setTrendWindow: (s: TrendWindowS) => void;
  silenceFor: (ms: number) => void;
  clearSilence: () => void;
}

function makeRings(): Rings {
  const out = {} as Record<VitalKey, RingBuffer>;
  for (const key of VITAL_KEYS) {
    out[key] = createRing(RING_CAPACITY);
  }
  return out;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  latest: null,
  lastSimTime: 0,
  rings: makeRings(),
  trendWindowS: 60,
  silencedUntilMs: null,

  pushFrame: (frame) => {
    const { rings, lastSimTime } = get();
    // Server reset / scenario switch: time went backward. Clear history.
    if (frame.sim_time_s + 0.5 < lastSimTime) {
      for (const key of VITAL_KEYS) {
        const r = rings[key];
        r.head = 0;
        r.length = 0;
        r.total = 0;
      }
    }
    for (const key of VITAL_KEYS) {
      pushRing(rings[key], frame[key]);
    }
    // Only `latest` triggers re-renders; rings mutate in place.
    set({ latest: frame, lastSimTime: frame.sim_time_s });
  },

  resetHistory: () => {
    const { rings } = get();
    for (const key of VITAL_KEYS) {
      const r = rings[key];
      r.head = 0;
      r.length = 0;
      r.total = 0;
    }
  },

  setTrendWindow: (s) => set({ trendWindowS: s }),
  silenceFor: (ms) => set({ silencedUntilMs: Date.now() + ms }),
  clearSilence: () => set({ silencedUntilMs: null }),
}));

/** Stable getter for the rings reference — useful from outside React (e.g.,
 *  the rAF clock that paints waveforms). */
export function getRings(): Rings {
  return useMonitorStore.getState().rings;
}
