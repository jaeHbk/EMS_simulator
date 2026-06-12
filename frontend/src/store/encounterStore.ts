// Zustand store: the single source of truth for client encounter state.
//
// Per the architecture (CLAUDE.md / AGENTS.md), the backend owns the state
// machine. The client never advances stages or computes scores locally — it
// renders `encounter.stage` and posts actions. Every action here calls the API
// client and sets the returned `Encounter` verbatim as the new state, so the
// store can never drift from the server's authoritative view.

import { create } from "zustand";

import { ApiError, apiClient, type ApiClient } from "../api/client";
import type { Encounter, Stage, TraineeAnalytics } from "../api/contract";
import { getTraineeId } from "../lib/traineeId";

/**
 * localStorage key under which the active encounter id is persisted so a
 * refresh / tab reload mid-encounter can rehydrate the encounter from the
 * server instead of dropping the trainee back to the start screen.
 */
const ACTIVE_ID_STORAGE_KEY = "ed-triage-active-encounter";

/**
 * Persist the active encounter id. Storage may be unavailable (private mode);
 * never throw — losing resume-on-reload is a degraded but acceptable fallback.
 */
function saveActiveId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, id);
  } catch {
    /* storage unavailable (private mode); resume just won't persist */
  }
}

/** Read the persisted active encounter id, or null if none / storage is unavailable. */
function loadActiveId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Drop the persisted active encounter id (on reset / a 404 stale id). */
function clearActiveId(): void {
  try {
    window.localStorage.removeItem(ACTIVE_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The serializable slice of store state. */
export interface EncounterState {
  /** Current encounter, or null before one is created / after a hard error. */
  encounter: Encounter | null;
  /** True while any action's request is in flight. */
  loading: boolean;
  /** Last action error message, or null. Cleared at the start of each action. */
  error: string | null;
  /** This browser's trainee learning-curve, or null until first fetched. */
  analytics: TraineeAnalytics | null;
  /**
   * The trainee's in-flight HISTORY question, or null. Set the moment
   * `sendHistory` is called (before the POST resolves) so the UI can echo the
   * question instantly + show a "patient is typing" cue, then cleared when the
   * request settles (on success AND failure).
   */
  pendingQuestion: string | null;
}

/** Async actions. Each wraps a client call and adopts its returned Encounter. */
export interface EncounterActions {
  createEncounter: (sources?: string[]) => Promise<void>;
  /**
   * Rehydrate the encounter on app load from the persisted active id. No stored
   * id → no-op (empty start state). A stored id that the server no longer knows
   * (404) is treated as an expected stale id: it's cleared and no error is
   * surfaced. Other failures flow through the normal `run()` error handling.
   */
  resume: () => Promise<void>;
  refresh: () => Promise<void>;
  advance: (to: Stage) => Promise<void>;
  sendHistory: (text: string) => Promise<void>;
  measureVitals: (fields: string[]) => Promise<void>;
  assignEsi: (esi: number) => Promise<void>;
  orderInterventions: (items: string[]) => Promise<void>;
  requestFeedback: () => Promise<void>;
  /**
   * Fetch this browser's trainee analytics and set `analytics` on success. A
   * failure is swallowed (it must never clobber the encounter or throw) — the
   * prior analytics value is left intact so the panel keeps showing last data.
   */
  fetchAnalytics: () => Promise<void>;
  /** Manually clear the current error (e.g. when dismissing a banner). */
  clearError: () => void;
  /** Reset the store to its empty initial state. */
  reset: () => void;
}

export type EncounterStore = EncounterState & EncounterActions;

const initialState: EncounterState = {
  encounter: null,
  loading: false,
  error: null,
  analytics: null,
  pendingQuestion: null,
};

/** Normalize any thrown value into a user-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/**
 * Factory so tests can inject a mock client. `useEncounterStore` is the real
 * singleton bound to the live API client.
 */
export function createEncounterStore(client: ApiClient = apiClient) {
  return create<EncounterStore>((set, get) => {
    /**
     * Shared wrapper: flips loading on, clears prior error, runs the request,
     * adopts the returned encounter, and always restores loading. Errors are
     * captured into `error` (state is left unchanged on failure) so the UI can
     * recover — the action never throws to its caller.
     */
    const run = async (op: () => Promise<Encounter>): Promise<void> => {
      set({ loading: true, error: null });
      try {
        const encounter = await op();
        // Persist the active id at this single chokepoint: every action that
        // adopts an encounter funnels through here, so a refresh mid-encounter
        // can rehydrate it via resume().
        saveActiveId(encounter.encounterId);
        set({ encounter, loading: false, error: null });
      } catch (error) {
        set({ loading: false, error: toMessage(error) });
      }
    };

    /** Read the current encounter id or throw a clear error if none exists. */
    const requireId = (): string => {
      const current = get().encounter;
      if (!current) throw new ApiError("No active encounter.", 0);
      return current.encounterId;
    };

    return {
      ...initialState,

      createEncounter: (sources) =>
        run(() => client.createEncounter(sources, getTraineeId())),

      resume: async () => {
        const storedId = loadActiveId();
        // No stored id → nothing to rehydrate; leave the empty start state.
        if (!storedId) return;
        // Track a 404 from the fetch: `run()` swallows the error into a message
        // string (losing the status), so observe the status here as the op runs.
        let staleId = false;
        await run(async () => {
          try {
            return await client.getEncounter(storedId);
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) staleId = true;
            throw error;
          }
        });
        // A 404 means the encounter is gone server-side (restarted backend,
        // evicted state): an expected stale id, not a real failure. Drop the
        // stored id and clear the error `run()` set so the UI shows the start
        // screen instead of a scary banner. Other errors keep normal handling.
        if (staleId) {
          clearActiveId();
          set({ error: null });
        }
      },

      refresh: () => run(() => client.getEncounter(requireId())),

      advance: (to) => run(() => client.advance(requireId(), to)),

      sendHistory: async (text) => {
        // Echo the question immediately: set it before the await so the panel
        // can render the optimistic trainee bubble + "patient is typing" cue.
        set({ pendingQuestion: text });
        try {
          await run(() => client.postHistory(requireId(), text));
        } finally {
          // Clear on every outcome — success adopts the real turns, failure
          // surfaces the error; either way the in-flight echo is no longer valid.
          set({ pendingQuestion: null });
        }
      },

      measureVitals: (fields) => run(() => client.postVitals(requireId(), fields)),

      assignEsi: (esi) => run(() => client.postEsi(requireId(), esi)),

      orderInterventions: (items) =>
        run(() => client.postInterventions(requireId(), items)),

      requestFeedback: () => run(() => client.postFeedback(requireId())),

      fetchAnalytics: async () => {
        try {
          const analytics = await client.getAnalytics(getTraineeId());
          set({ analytics });
        } catch {
          // Analytics is a secondary read: never surface as an action error or
          // touch the encounter. Leave the prior `analytics` value intact.
        }
      },

      clearError: () => set({ error: null }),

      reset: () => {
        clearActiveId();
        set({ ...initialState });
      },
    };
  });
}

/** The live store singleton, bound to the real API client. */
export const useEncounterStore = createEncounterStore();

// --- Typed selector hooks (components subscribe narrowly to avoid re-renders) ---

/** The current encounter, or null. */
export const useEncounter = (): Encounter | null =>
  useEncounterStore((s) => s.encounter);

/** The current stage, or null when no encounter is loaded. */
export const useStage = (): Stage | null =>
  useEncounterStore((s) => s.encounter?.stage ?? null);

/** True while a request is in flight. */
export const useLoading = (): boolean => useEncounterStore((s) => s.loading);

/** Current error message, or null. */
export const useError = (): string | null => useEncounterStore((s) => s.error);

/** This browser's trainee analytics, or null until first fetched. */
export const useAnalytics = (): TraineeAnalytics | null =>
  useEncounterStore((s) => s.analytics);

/** The trainee's in-flight HISTORY question, or null when none is pending. */
export const usePendingQuestion = (): string | null =>
  useEncounterStore((s) => s.pendingQuestion);

/** All store actions, as a stable bag of functions. */
export const useEncounterActions = (): EncounterActions =>
  useEncounterStore(selectActions);

function selectActions(s: EncounterStore): EncounterActions {
  return {
    createEncounter: s.createEncounter,
    resume: s.resume,
    refresh: s.refresh,
    advance: s.advance,
    sendHistory: s.sendHistory,
    measureVitals: s.measureVitals,
    assignEsi: s.assignEsi,
    orderInterventions: s.orderInterventions,
    requestFeedback: s.requestFeedback,
    fetchAnalytics: s.fetchAnalytics,
    clearError: s.clearError,
    reset: s.reset,
  };
}
