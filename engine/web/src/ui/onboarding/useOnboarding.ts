// First-run onboarding state. Persistence mirrors useSettings: a tiny
// hand-rolled localStorage read on init + write on change (no persist
// middleware, to keep the bundle lean). Guarded for the node test env
// where `window` is undefined.

import { create } from 'zustand';

const STORAGE_KEY = 'ems.onboarding.v1';

function loadCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { completed?: unknown }).completed === true
    );
  } catch {
    return false;
  }
}

function persistCompleted(completed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed }));
  } catch {
    // ignore — quota / private mode
  }
}

interface OnboardingState {
  isOpen: boolean;
  completed: boolean;
  open: () => void;
  close: () => void;
  /** Close + remember that the user finished/skipped the tour. */
  markCompleted: () => void;
  /** Open regardless of completion (Help button); does not clear the flag. */
  reopen: () => void;
  /** Whether the wizard should auto-open on app mount. */
  shouldAutoOpen: () => boolean;
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  isOpen: false,
  completed: loadCompleted(),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  markCompleted: () => {
    set({ isOpen: false, completed: true });
    persistCompleted(true);
  },
  reopen: () => set({ isOpen: true }),
  shouldAutoOpen: () => !get().completed,
}));
