// Test-only fixtures for the web-stages module. Provides a typed fake Encounter
// and a fake store factory that mimics the Zustand selector calling convention
// (`useStore((s) => s.slice)`), so stage components and the router can be rendered
// without web-core's real store or any network.

import { vi } from "vitest";
import type {
  AnalyticsPoint,
  Encounter,
  ScoreReport,
  Stage,
  TraineeAnalytics,
  TriageDirection,
  Vitals,
} from "../api/contract";
import type { EncounterStoreState } from "./storeContract";

export const EMPTY_VITALS: Vitals = {
  heartRate: null,
  systolicBP: null,
  diastolicBP: null,
  respiratoryRate: null,
  spo2: null,
  temperatureC: null,
  painScore: null,
  glucose: null,
  avpu: null,
};

export function makeEncounter(overrides: Partial<Encounter> = {}): Encounter {
  return {
    encounterId: "enc-1",
    caseId: "synthetic:chest-pain-001",
    stage: "CASE_LOAD",
    chiefComplaint: "Chest pain for 2 hours",
    history: [],
    measuredVitals: { ...EMPTY_VITALS },
    esiAssigned: null,
    interventionsOrdered: [],
    scoreReport: null,
    startedAt: "2026-06-09T00:00:00Z",
    completedAt: null,
    ...overrides,
  };
}

export function makeScoreReport(
  direction: TriageDirection = "CORRECT",
  overrides: Partial<ScoreReport> = {},
): ScoreReport {
  const assigned = direction === "UNDER_TRIAGE" ? 4 : direction === "OVER_TRIAGE" ? 1 : 2;
  const expert = 2;
  return {
    encounterId: "enc-1",
    esi: {
      assigned,
      expert,
      correct: direction === "CORRECT",
      triageDirection: direction,
      levelsOff: assigned - expert,
    },
    dimensions: [
      {
        key: "ESI_ACCURACY",
        label: "ESI accuracy",
        score: direction === "CORRECT" ? 1 : 0.3,
        weight: 0.5,
        detail: "ESI scoring detail.",
      },
      {
        key: "HISTORY_COMPLETENESS",
        label: "History completeness",
        score: 0.6,
        weight: 0.2,
        detail: "Some red flags missed.",
      },
    ],
    overallPercent: direction === "CORRECT" ? 88 : 42,
    narrative: "",
    missedRedFlags: [],
    ...overrides,
  };
}

export function makeAnalyticsPoint(
  direction: TriageDirection = "CORRECT",
  overrides: Partial<AnalyticsPoint> = {},
): AnalyticsPoint {
  const assigned = direction === "UNDER_TRIAGE" ? 4 : direction === "OVER_TRIAGE" ? 1 : 2;
  return {
    encounterId: "enc-1",
    startedAt: "2026-06-09T00:00:00Z",
    triageDirection: direction,
    esiAssigned: assigned,
    esiExpert: 2,
    overallPercent: direction === "CORRECT" ? 88 : 42,
    ...overrides,
  };
}

export function makeAnalytics(
  overrides: Partial<TraineeAnalytics> = {},
): TraineeAnalytics {
  const history = overrides.history ?? [
    makeAnalyticsPoint("UNDER_TRIAGE", { encounterId: "enc-1" }),
    makeAnalyticsPoint("OVER_TRIAGE", { encounterId: "enc-2" }),
    makeAnalyticsPoint("CORRECT", { encounterId: "enc-3" }),
  ];
  return {
    traineeId: "trainee-fixture",
    totalEncounters: history.length,
    underTriageRate: 1 / 3,
    overTriageRate: 1 / 3,
    correctRate: 1 / 3,
    meanLevelsOffAbs: 1,
    ...overrides,
    history,
  };
}

/**
 * Build a fake store state, fully typed against EncounterStoreState. All actions
 * default to vi.fn() returning a resolved promise so components can call them.
 */
export function makeStoreState(
  overrides: Partial<EncounterStoreState> = {},
): EncounterStoreState {
  const noop = (): Promise<void> => Promise.resolve();
  return {
    encounter: null,
    loading: false,
    error: null,
    createEncounter: vi.fn(noop),
    refresh: vi.fn(noop),
    advance: vi.fn(noop),
    sendHistory: vi.fn(noop),
    measureVitals: vi.fn(noop),
    assignEsi: vi.fn(noop),
    orderInterventions: vi.fn(noop),
    requestFeedback: vi.fn(noop),
    clearError: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

/**
 * A fake `useEncounterStore` hook that honours the Zustand selector convention:
 * called with a selector it returns the selected slice; called bare it returns
 * the whole state. Returns the mock fn so tests can swap the backing state.
 */
export function makeUseStore(state: EncounterStoreState) {
  const ref = { current: state };
  const hook = <T>(selector?: (s: EncounterStoreState) => T): T | EncounterStoreState => {
    if (selector) {
      return selector(ref.current);
    }
    return ref.current;
  };
  return Object.assign(hook, {
    setState: (next: EncounterStoreState) => {
      ref.current = next;
    },
  });
}

export const STAGES: readonly Stage[] = [
  "CASE_LOAD",
  "HISTORY",
  "VITALS",
  "ESI_ASSIGNMENT",
  "INTERVENTIONS",
  "FEEDBACK",
];
