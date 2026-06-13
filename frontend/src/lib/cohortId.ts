// Per-browser cohort code for the instructor's aggregate ("cohort mode") view.
// This is NOT an identity or credential — it is an opaque grouping key the
// backend uses to attribute a trainee's scored encounters to a cohort so an
// instructor can see the cohort's aggregate under-triage rate + per-trainee
// breakdown.
//
// Unlike traineeId (which is ALWAYS minted once and persisted), the cohort code
// is OPT-IN: it is null until a trainee deliberately "joins" a cohort, and can
// be cleared by "leaving". Mirrors traineeId.ts's try/catch storage handling so
// the app keeps working in private mode / when storage is unavailable. Pure
// module, no React.

const STORAGE_KEY = "ed-triage-cohort";

/**
 * Read the persisted cohort code, or null when the trainee has not joined a
 * cohort (NOT minted). Storage failures (private mode, disabled storage) never
 * throw — they are treated as "not joined" and return null.
 */
export function getCohortId(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Treat an empty/whitespace-only stored value as "not joined".
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Persist a cohort code. The code is trimmed; a blank/whitespace-only code is
 * ignored (joining nothing is a no-op, not an error). Storage failures never
 * throw — the join just won't persist across reloads.
 */
export function setCohortId(code: string): void {
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* storage unavailable (private mode); join just won't persist */
  }
}

/** Drop the persisted cohort code (on "leave"). Never throws. */
export function clearCohortId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
