import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import type { Encounter } from "./api/contract";
import {
  EMPTY_VITALS,
  makeEncounter,
  makeScoreReport,
} from "./workflow/testFixtures";

// Backing state for the mocked store; reset per test. The selector hooks below
// read from this object so a test can mutate it and re-render to simulate a
// store transition (a new patient turn, vitals coming back, a score, etc.).
interface MockState {
  encounter: Encounter | null;
  loading: boolean;
  error: string | null;
  analytics: null;
}

let state: MockState;

function makeState(overrides: Partial<MockState> = {}): MockState {
  return {
    encounter: null,
    loading: false,
    error: null,
    analytics: null,
    ...overrides,
  };
}

// Mock the store module wholesale: provide the selector hooks App + its child
// components consume, plus the bare `useEncounterStore` (selector convention)
// that WorkflowRouter reads. Actions are no-op vi.fns — App only calls them from
// event handlers/effects we don't exercise for the aria-live assertions.
const noop = (): Promise<void> => Promise.resolve();
const actions = {
  createEncounter: vi.fn(noop),
  resume: vi.fn(noop),
  refresh: vi.fn(noop),
  advance: vi.fn(noop),
  sendHistory: vi.fn(noop),
  measureVitals: vi.fn(noop),
  assignEsi: vi.fn(noop),
  orderInterventions: vi.fn(noop),
  requestFeedback: vi.fn(noop),
  fetchAnalytics: vi.fn(noop),
  clearError: vi.fn(),
  reset: vi.fn(),
};

vi.mock("./store/encounterStore", () => ({
  useEncounter: () => state.encounter,
  useStage: () => state.encounter?.stage ?? null,
  useLoading: () => state.loading,
  useError: () => state.error,
  useAnalytics: () => state.analytics,
  usePendingQuestion: () => null,
  useEncounterActions: () => actions,
  // Zustand selector convention: bare → whole state, with a selector → a slice.
  useEncounterStore: <T,>(selector?: (s: unknown) => T) => {
    const full = { ...state, ...actions };
    return selector ? selector(full) : full;
  },
}));

// Import AFTER the mock is registered.
import App from "./App";

const ariaLive = (): HTMLElement =>
  document.querySelector('[aria-live="polite"]') as HTMLElement;

describe("App accessibility status region", () => {
  beforeEach(() => {
    state = makeState();
    vi.clearAllMocks();
  });

  it("renders a visually-hidden polite aria-live region", () => {
    render(<App />);
    const region = ariaLive();
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveClass("sr-only");
    // No transition has occurred yet → no message.
    expect(region.textContent).toBe("");
  });

  it("announces 'Encounter started.' when an encounter first appears", () => {
    const { rerender } = render(<App />);
    expect(ariaLive().textContent).toBe("");

    act(() => {
      state = makeState({ encounter: makeEncounter({ stage: "HISTORY" }) });
    });
    rerender(<App />);

    expect(ariaLive()).toHaveTextContent("Encounter started.");
  });

  it("announces 'Patient replied.' when a new patient turn arrives", () => {
    state = makeState({
      encounter: makeEncounter({
        stage: "HISTORY",
        history: [{ role: "trainee", text: "Where does it hurt?" }],
      }),
    });
    const { rerender } = render(<App />);

    act(() => {
      state = makeState({
        encounter: makeEncounter({
          stage: "HISTORY",
          history: [
            { role: "trainee", text: "Where does it hurt?" },
            { role: "patient", text: "My chest." },
          ],
        }),
      });
    });
    rerender(<App />);

    expect(ariaLive()).toHaveTextContent("Patient replied.");
  });

  it("announces 'Vitals measured.' when measuredVitals gains values", () => {
    state = makeState({
      encounter: makeEncounter({ stage: "VITALS" }),
    });
    const { rerender } = render(<App />);

    act(() => {
      state = makeState({
        encounter: makeEncounter({
          stage: "VITALS",
          measuredVitals: { ...EMPTY_VITALS, heartRate: 96 },
        }),
      });
    });
    rerender(<App />);

    expect(ariaLive()).toHaveTextContent("Vitals measured.");
  });

  it("announces 'Score ready.' when a score report appears", () => {
    state = makeState({
      encounter: makeEncounter({ stage: "INTERVENTIONS" }),
    });
    const { rerender } = render(<App />);

    act(() => {
      state = makeState({
        encounter: makeEncounter({
          stage: "FEEDBACK",
          scoreReport: makeScoreReport(),
        }),
      });
    });
    rerender(<App />);

    expect(ariaLive()).toHaveTextContent("Score ready.");
  });

  it("does not change the message on a re-render with no meaningful transition", () => {
    state = makeState({
      encounter: makeEncounter({
        stage: "HISTORY",
        history: [
          { role: "trainee", text: "Where does it hurt?" },
          { role: "patient", text: "My chest." },
        ],
      }),
    });
    const { rerender } = render(<App />);
    // Mount of an existing encounter announces the start once.
    expect(ariaLive()).toHaveTextContent("Encounter started.");

    // Re-render with identical-shape state: the message is left unchanged (no
    // new transition), proving we don't re-announce on every render.
    act(() => {
      state = makeState({
        encounter: makeEncounter({
          stage: "HISTORY",
          history: [
            { role: "trainee", text: "Where does it hurt?" },
            { role: "patient", text: "My chest." },
          ],
        }),
      });
    });
    rerender(<App />);
    expect(ariaLive()).toHaveTextContent("Encounter started.");
  });

  it("renders the required in-product disclaimer", () => {
    render(<App />);
    expect(
      screen.getByText(/educational training tool — not a medical device/i),
    ).toBeInTheDocument();
  });
});
