import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { makeEncounter, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

// Backing state the mocked hook reads from; reset per test.
let storeState: EncounterStoreState = makeStoreState();

// Mock the web-core store. EsiAssignment reads only via selectors (encounter,
// assignEsi, advance, loading) — no getState() is needed.
vi.mock("../store/encounterStore", () => ({
  useEncounterStore: <T,>(selector?: (s: EncounterStoreState) => T) =>
    selector ? selector(storeState) : storeState,
}));

import { EsiAssignment } from "./EsiAssignment";

describe("EsiAssignment stage", () => {
  beforeEach(() => {
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "ESI_ASSIGNMENT", esiAssigned: null }),
    });
  });

  it("renders the 'ESI assignment' heading", () => {
    render(<EsiAssignment />);
    expect(
      screen.getByRole("heading", { name: /esi assignment/i }),
    ).toBeInTheDocument();
  });

  it("assigns the chosen ESI level when a tile is clicked", () => {
    const assignEsi = vi.fn(async () => {});
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "ESI_ASSIGNMENT", esiAssigned: null }),
      assignEsi,
    });

    render(<EsiAssignment />);
    // EsiSelector renders each level as role="radio" with a data-level; clicking
    // the ESI 2 tile records level 2.
    fireEvent.click(screen.getByText("ESI 2"));

    expect(assignEsi).toHaveBeenCalledTimes(1);
    expect(assignEsi).toHaveBeenCalledWith(2);
  });

  it("disables 'Proceed to interventions' when no level is recorded", () => {
    render(<EsiAssignment />);
    expect(
      screen.getByRole("button", { name: /proceed to interventions/i }),
    ).toBeDisabled();
  });

  it("enables 'Proceed to interventions' once a level is recorded", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "ESI_ASSIGNMENT", esiAssigned: 2 }),
    });

    render(<EsiAssignment />);
    expect(
      screen.getByRole("button", { name: /proceed to interventions/i }),
    ).toBeEnabled();
  });
});
