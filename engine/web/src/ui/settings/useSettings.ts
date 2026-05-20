// Persistent settings store. Backed by localStorage so a refresh keeps
// the user's audio/a11y/units choices.
//
// Persistence is deliberately bare (no zustand/middleware/persist dep) so
// the bundle stays lean. We hand-roll a load + a subscribe-to-save effect.

import { create } from 'zustand';
import { setMuted } from '../monitor/audio/tones';

const STORAGE_KEY = 'ems.settings.v1';

export type ColorBlindMode =
  | 'none'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia';
export type TempUnit = 'celsius' | 'fahrenheit';

export interface SettingsState {
  audioMuted: boolean;
  alarmVolume: number;       // 0..1
  ambientVolume: number;     // 0..1
  colorBlindMode: ColorBlindMode;
  reducedMotion: boolean;    // user override; OS pref still applies
  largeVitals: boolean;
  tempUnit: TempUnit;
  /** Set after a passcode unlock; allows the instructor drawer. */
  instructorUnlocked: boolean;

  setAudioMuted: (v: boolean) => void;
  setAlarmVolume: (v: number) => void;
  setAmbientVolume: (v: number) => void;
  setColorBlindMode: (m: ColorBlindMode) => void;
  setReducedMotion: (v: boolean) => void;
  setLargeVitals: (v: boolean) => void;
  setTempUnit: (u: TempUnit) => void;
  unlockInstructor: () => void;
  lockInstructor: () => void;
}

const DEFAULTS = {
  audioMuted: true,
  alarmVolume: 0.6,
  ambientVolume: 0.0,
  colorBlindMode: 'none' as ColorBlindMode,
  reducedMotion: false,
  largeVitals: false,
  tempUnit: 'celsius' as TempUnit,
  instructorUnlocked: false,
};

function loadPersisted(): Partial<typeof DEFAULTS> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Pluck only known keys to avoid foreign-blob injection.
    const out: Partial<typeof DEFAULTS> = {};
    const o = parsed as Record<string, unknown>;
    if (typeof o.audioMuted === 'boolean') out.audioMuted = o.audioMuted;
    if (typeof o.alarmVolume === 'number') out.alarmVolume = clamp01(o.alarmVolume);
    if (typeof o.ambientVolume === 'number') out.ambientVolume = clamp01(o.ambientVolume);
    if (typeof o.colorBlindMode === 'string')
      out.colorBlindMode = o.colorBlindMode as ColorBlindMode;
    if (typeof o.reducedMotion === 'boolean') out.reducedMotion = o.reducedMotion;
    if (typeof o.largeVitals === 'boolean') out.largeVitals = o.largeVitals;
    if (o.tempUnit === 'celsius' || o.tempUnit === 'fahrenheit')
      out.tempUnit = o.tempUnit;
    return out;
  } catch {
    return {};
  }
}

function persist(state: SettingsState): void {
  if (typeof window === 'undefined') return;
  // instructorUnlocked is intentionally NOT persisted — passcode resets
  // each session.
  const { setAudioMuted: _a, setAlarmVolume: _b, setAmbientVolume: _c,
    setColorBlindMode: _d, setReducedMotion: _e, setLargeVitals: _f,
    setTempUnit: _g, unlockInstructor: _h, lockInstructor: _i,
    instructorUnlocked: _j, ...persistable } = state;
  void _a; void _b; void _c; void _d; void _e; void _f; void _g; void _h; void _i; void _j;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // ignore — quota / private mode
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

const persisted = loadPersisted();

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  ...persisted,
  setAudioMuted: (v) => {
    setMuted(v);
    set({ audioMuted: v });
    persist(get());
  },
  setAlarmVolume: (v) => {
    set({ alarmVolume: clamp01(v) });
    persist(get());
  },
  setAmbientVolume: (v) => {
    set({ ambientVolume: clamp01(v) });
    persist(get());
  },
  setColorBlindMode: (m) => {
    set({ colorBlindMode: m });
    applyColorBlindMode(m);
    persist(get());
  },
  setReducedMotion: (v) => {
    set({ reducedMotion: v });
    document.documentElement.classList.toggle('rm-override', v);
    persist(get());
  },
  setLargeVitals: (v) => {
    set({ largeVitals: v });
    document.documentElement.classList.toggle('large-vitals', v);
    persist(get());
  },
  setTempUnit: (u) => {
    set({ tempUnit: u });
    persist(get());
  },
  unlockInstructor: () => set({ instructorUnlocked: true }),
  lockInstructor: () => set({ instructorUnlocked: false }),
}));

/** Apply persisted settings on first import (so a reload restores
 *  visual state without waiting for any component to call a setter). */
export function bootstrapSettings(): void {
  if (typeof document === 'undefined') return;
  const s = useSettings.getState();
  setMuted(s.audioMuted);
  applyColorBlindMode(s.colorBlindMode);
  document.documentElement.classList.toggle('rm-override', s.reducedMotion);
  document.documentElement.classList.toggle('large-vitals', s.largeVitals);
}

/** Color-blind palette swap. We toggle a class on <html>; the CSS
 *  shifts `--alarm` / `--abnormal` / `--accent` to a perceptually
 *  separable triad for each variant. */
function applyColorBlindMode(mode: ColorBlindMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('cb-deut', 'cb-prot', 'cb-trit');
  if (mode === 'deuteranopia') root.classList.add('cb-deut');
  else if (mode === 'protanopia') root.classList.add('cb-prot');
  else if (mode === 'tritanopia') root.classList.add('cb-trit');
}
