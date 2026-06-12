// Per-browser learner id for progress analytics. This is NOT an identity or
// credential — it is an opaque key the backend uses to attribute scored
// encounters to a learning curve. Minted once and persisted in localStorage,
// mirroring theme-provider's try/catch storage handling so the app keeps working
// in private mode / when storage is unavailable. Pure module, no React.

const STORAGE_KEY = "trainee-id";

/** RFC4122-ish fallback for environments without `crypto.randomUUID`. */
function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-cryptographic fallback (jsdom older envs, very old browsers). Good enough
  // for an opaque analytics key that is not a credential.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read the persisted trainee id, minting and storing `trainee-<uuid>` on first
 * use. Storage failures (private mode, disabled storage) never throw — the id is
 * still returned so analytics calls can proceed in-memory for the session.
 */
export function getTraineeId(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* storage may be unavailable (private mode); fall through and mint one */
  }

  const minted = `trainee-${randomUuid()}`;
  try {
    window.localStorage.setItem(STORAGE_KEY, minted);
  } catch {
    /* ignore — the id still works for this session */
  }
  return minted;
}
