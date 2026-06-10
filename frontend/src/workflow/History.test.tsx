import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { makeEncounter, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

// Backing state the mocked hook reads from; reset per test.
let storeState: EncounterStoreState = makeStoreState();

// Mock the web-core store. History reads only via selectors (encounter,
// sendHistory, advance, loading) — no getState() is needed.
vi.mock("../store/encounterStore", () => ({
  useEncounterStore: <T,>(selector?: (s: EncounterStoreState) => T) =>
    selector ? selector(storeState) : storeState,
}));

import { History } from "./History";

describe("History stage", () => {
  beforeEach(() => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "HISTORY",
        history: [
          { role: "trainee", text: "When did the pain start?" },
          { role: "patient", text: "About two hours ago." },
        ],
      }),
    });
  });

  it("renders the 'History taking' heading", () => {
    render(<History />);
    expect(
      screen.getByRole("heading", { name: /history taking/i }),
    ).toBeInTheDocument();
  });

  it("renders both transcript turns with their data-role markers", () => {
    const { container } = render(<History />);

    expect(screen.getByText("When did the pain start?")).toBeInTheDocument();
    expect(screen.getByText("About two hours ago.")).toBeInTheDocument();

    const traineeTurn = container.querySelector('[data-role="trainee"]');
    const patientTurn = container.querySelector('[data-role="patient"]');
    expect(traineeTurn).toHaveTextContent("When did the pain start?");
    expect(patientTurn).toHaveTextContent("About two hours ago.");
  });

  it("calls sendHistory with the typed text when Send is clicked", () => {
    const sendHistory = vi.fn(async () => {});
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "HISTORY", history: [] }),
      sendHistory,
    });

    render(<History />);

    // The Send button is disabled until the composer has non-empty text, so
    // type into the textarea first (mirrors how a trainee uses it).
    const textarea = screen.getByLabelText(/question to patient/i);
    fireEvent.change(textarea, {
      target: { value: "Any shortness of breath?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(sendHistory).toHaveBeenCalledTimes(1);
    expect(sendHistory).toHaveBeenCalledWith("Any shortness of breath?");
  });

  it("advances to VITALS when 'Proceed to vitals' is clicked", () => {
    const advance = vi.fn(async () => {});
    storeState = makeStoreState({
      encounter: makeEncounter({ stage: "HISTORY" }),
      advance,
    });

    render(<History />);
    fireEvent.click(
      screen.getByRole("button", { name: /proceed to vitals/i }),
    );

    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith("VITALS");
  });
});
