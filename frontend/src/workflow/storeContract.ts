// The seam between web-stages (this module) and web-core (owner of the store).
//
// web-core builds frontend/src/store/encounterStore.ts. Per MODULE_INTERFACES.md
// it is a Zustand store holding `{ encounter, loading, error }` plus async actions
// that wrap each client call (createEncounter, refresh, advance, sendHistory,
// measureVitals, assignEsi, orderInterventions, requestFeedback) and set the
// returned Encounter as the single source of truth. The action NAMES below mirror
// the real store's exports exactly — drift here would silently break selectors.
//
// This file does NOT implement or redefine that store. It only declares the TYPE
// of the surface this module consumes, so stage components can type their
// selectors without reaching into web-core internals. The runtime hook itself is
// imported from `../store/encounterStore`; tests mock that module.

import type { Encounter, Stage } from "../api/contract";

/**
 * The public state + actions shape of the encounter store, as documented in
 * MODULE_INTERFACES.md. Actions return the updated Encounter (or void); stage
 * components only await them and then re-read `encounter` from the store.
 */
export interface EncounterStoreState {
  // ---- state ----
  encounter: Encounter | null;
  loading: boolean;
  error: string | null;

  // ---- async actions (wrap the typed client, set `encounter`) ----
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

/**
 * The Zustand hook signature this module relies on: callable bare to get the
 * whole state, or with a selector to subscribe to a slice. This matches the
 * standard Zustand `UseBoundStore` shape and what web-core exports.
 */
export type UseEncounterStore = {
  (): EncounterStoreState;
  <T>(selector: (state: EncounterStoreState) => T): T;
};
