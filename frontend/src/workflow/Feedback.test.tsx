import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeEncounter, makeScoreReport, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

let storeState: EncounterStoreState = makeStoreState();

vi.mock("../store/encounterStore", () => ({
  useEncounterStore: <T,>(selector?: (s: EncounterStoreState) => T) =>
    selector ? selector(storeState) : storeState,
}));

import { Feedback } from "./Feedback";

describe("Feedback", () => {
  beforeEach(() => {
    storeState = makeStoreState();
  });

  it("lists missed red flags from the score report", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "FEEDBACK",
        scoreReport: makeScoreReport("UNDER_TRIAGE", {
          missedRedFlags: ["Hypotension", "Altered mental status"],
        }),
      }),
    });
    render(<Feedback />);
    expect(screen.getByText("Hypotension")).toBeInTheDocument();
    expect(screen.getByText("Altered mental status")).toBeInTheDocument();
  });

  it("surfaces the under-triage warning through ScoreCard", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "FEEDBACK",
        scoreReport: makeScoreReport("UNDER_TRIAGE"),
      }),
    });
    render(<Feedback />);
    expect(screen.getByRole("alert")).toHaveTextContent(/under-triage/i);
  });

  it("renders the LLM narrative when present", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "FEEDBACK",
        scoreReport: makeScoreReport("CORRECT", {
          narrative: "Solid history-taking; consider charting pain earlier.",
        }),
      }),
    });
    render(<Feedback />);
    expect(
      screen.getByText(/solid history-taking/i),
    ).toBeInTheDocument();
  });

  it("shows a scoring placeholder when no report yet", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "FEEDBACK", scoreReport: null }),
    });
    render(<Feedback />);
    expect(screen.getByText(/scoring this encounter/i)).toBeInTheDocument();
  });
});
