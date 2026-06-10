// Zustand store: the single source of truth for client encounter state.
//
// Per the architecture (CLAUDE.md / AGENTS.md), the backend owns the state
// machine. The client never advances stages or computes scores locally — it
// renders `encounter.stage` and posts actions. Every action here calls the API
// client and sets the returned `Encounter` verbatim as the new state, so the
// store can never drift from the server's authoritative view.

import { create } from "zustand";

import { ApiError, apiClient, type ApiClient } from "../api/client";
import type { Encounter, Stage } from "../api/contract";

/** The serializable slice of store state. */
export interface EncounterState {
  /** Current encounter, or null before one is created / after a hard error. */
  encounter: Encounter | null;
  /** True while any action's request is in flight. */
  loading: boolean;
  /** Last action error message, or null. Cleared at the start of each action. */
  error: string | null;
}

/** Async actions. Each wraps a client call and adopts its returned Encounter. */
export interface EncounterActions {
  createEncounter: (sources?: string[]) => Promise<void>;
  refresh: () => Promise<void>;
  advance: (to: Stage) => Promise<void>;
  sendHistory: (text: string) => Promise<void>;
  measureVitals: (fields: string[]) => Promise<void>;
  assignEsi: (esi: number) => Promise<void>;
  orderInterventions: (items: string[]) => Promise<void>;
  requestFeedback: () => Promise<void>;
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

      createEncounter: (sources) => run(() => client.createEncounter(sources)),

      refresh: () => run(() => client.getEncounter(requireId())),

      advance: (to) => run(() => client.advance(requireId(), to)),

      sendHistory: (text) => run(() => client.postHistory(requireId(), text)),

      measureVitals: (fields) => run(() => client.postVitals(requireId(), fields)),

      assignEsi: (esi) => run(() => client.postEsi(requireId(), esi)),

      orderInterventions: (items) =>
        run(() => client.postInterventions(requireId(), items)),

      requestFeedback: () => run(() => client.postFeedback(requireId())),

      clearError: () => set({ error: null }),

      reset: () => set({ ...initialState }),
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

/** All store actions, as a stable bag of functions. */
export const useEncounterActions = (): EncounterActions =>
  useEncounterStore(selectActions);

function selectActions(s: EncounterStore): EncounterActions {
  return {
    createEncounter: s.createEncounter,
    refresh: s.refresh,
    advance: s.advance,
    sendHistory: s.sendHistory,
    measureVitals: s.measureVitals,
    assignEsi: s.assignEsi,
    orderInterventions: s.orderInterventions,
    requestFeedback: s.requestFeedback,
    clearError: s.clearError,
    reset: s.reset,
  };
}
