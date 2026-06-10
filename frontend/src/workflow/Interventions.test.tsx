import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { makeEncounter, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

// Backing state the mocked hook reads from; reset per test.
let storeState: EncounterStoreState = makeStoreState();

// Mock web-core's store: callable with the Zustand selector convention AND
// exposing getState() (which Interventions uses to gate feedback on success).
vi.mock("../store/encounterStore", () => ({
  useEncounterStore: Object.assign(
    <T,>(selector?: (s: EncounterStoreState) => T) =>
      selector ? selector(storeState) : storeState,
    { getState: () => storeState },
  ),
}));

import { Interventions } from "./Interventions";

describe("Interventions stage", () => {
  beforeEach(() => {
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "INTERVENTIONS" }),
    });
  });

  it("requests feedback after a successful order", async () => {
    const orderInterventions = vi.fn(async () => {
      storeState.error = null; // success leaves no error
    });
    const requestFeedback = vi.fn(async () => {});
    storeState.orderInterventions = orderInterventions;
    storeState.requestFeedback = requestFeedback;

    render(<Interventions />);
    fireEvent.click(screen.getByRole("button", { name: /submit and see feedback/i }));

    // Let the async submit chain resolve.
    await vi.waitFor(() => expect(orderInterventions).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(requestFeedback).toHaveBeenCalledTimes(1));
  });

  it("does NOT request feedback when the order fails", async () => {
    const orderInterventions = vi.fn(async () => {
      storeState.error = "Illegal transition"; // failure captured into store
    });
    const requestFeedback = vi.fn(async () => {});
    storeState.orderInterventions = orderInterventions;
    storeState.requestFeedback = requestFeedback;

    render(<Interventions />);
    fireEvent.click(screen.getByRole("button", { name: /submit and see feedback/i }));

    await vi.waitFor(() => expect(orderInterventions).toHaveBeenCalledTimes(1));
    // Give any erroneous chained call a chance to fire, then assert it did not.
    await Promise.resolve();
    expect(requestFeedback).not.toHaveBeenCalled();
  });
});
