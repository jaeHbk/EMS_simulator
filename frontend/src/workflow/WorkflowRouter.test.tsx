import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Stage } from "../api/contract";
import { makeEncounter, makeScoreReport, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

// Backing state the mocked hook reads from; reset per test.
let storeState: EncounterStoreState = makeStoreState();

// Mock the web-core store module. The hook honours the Zustand selector
// convention: with a selector it returns the slice, bare it returns all state.
vi.mock("../store/encounterStore", () => ({
  useEncounterStore: <T,>(selector?: (s: EncounterStoreState) => T) =>
    selector ? selector(storeState) : storeState,
}));

// Import AFTER the mock is registered.
import { WorkflowRouter } from "./WorkflowRouter";

// A distinctive marker each stage renders, used to confirm routing.
const STAGE_HEADING: Record<Stage, RegExp> = {
  CASE_LOAD: /chief complaint/i,
  HISTORY: /history taking/i,
  VITALS: /^vitals$/i,
  ESI_ASSIGNMENT: /esi assignment/i,
  INTERVENTIONS: /critical interventions/i,
  FEEDBACK: /^feedback$/i,
};

describe("WorkflowRouter", () => {
  beforeEach(() => {
    storeState = makeStoreState();
  });

  it("prompts to start when there is no encounter", () => {
    storeState = makeStoreState({ encounter: null });
    render(<WorkflowRouter />);
    expect(screen.getByText(/no active encounter/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start new encounter/i }),
    ).toBeInTheDocument();
  });

  it.each<Stage>([
    "CASE_LOAD",
    "HISTORY",
    "VITALS",
    "ESI_ASSIGNMENT",
    "INTERVENTIONS",
    "FEEDBACK",
  ])("renders the matching component for stage %s", (stage) => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage,
        // Feedback needs a report to render its ScoreCard heading area.
        scoreReport: stage === "FEEDBACK" ? makeScoreReport() : null,
      }),
    });
    render(<WorkflowRouter />);
    expect(screen.getByRole("heading", { name: STAGE_HEADING[stage] })).toBeInTheDocument();
  });

  it("shows a step indicator with all six stages when an encounter exists", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "VITALS" }),
    });
    const { container } = render(<WorkflowRouter />);
    const steps = container.querySelectorAll(".step-indicator__step");
    expect(steps).toHaveLength(6);
    // The current stage is marked aria-current="step".
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.getAttribute("data-stage")).toBe("VITALS");
  });

  it("surfaces a store error", () => {
    storeState = makeStoreState({ encounter: null, error: "Boom" });
    render(<WorkflowRouter />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });
});
