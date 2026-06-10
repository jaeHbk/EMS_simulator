import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { makeEncounter, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

// Backing state the mocked hook reads from; reset per test.
let storeState: EncounterStoreState = makeStoreState();

// Mock the web-core store. The hook honours the Zustand selector convention:
// with a selector it returns the slice, bare it returns all state. CaseLoad reads
// only via selectors (encounter, advance, loading), so no getState() is needed.
vi.mock("../store/encounterStore", () => ({
  useEncounterStore: <T,>(selector?: (s: EncounterStoreState) => T) =>
    selector ? selector(storeState) : storeState,
}));

import { CaseLoad } from "./CaseLoad";

describe("CaseLoad stage", () => {
  beforeEach(() => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "CASE_LOAD",
        chiefComplaint: "Crushing chest pain radiating to the left arm",
      }),
    });
  });

  it("renders the chief-complaint heading and the complaint text", () => {
    render(<CaseLoad />);
    expect(
      screen.getByRole("heading", { name: /chief complaint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Crushing chest pain radiating to the left arm"),
    ).toBeInTheDocument();
  });

  it("advances to HISTORY when 'Begin history' is clicked", () => {
    const advance = vi.fn(async () => {});
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "CASE_LOAD" }),
      advance,
    });

    render(<CaseLoad />);
    fireEvent.click(screen.getByRole("button", { name: /begin history/i }));

    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith("HISTORY");
  });
});
