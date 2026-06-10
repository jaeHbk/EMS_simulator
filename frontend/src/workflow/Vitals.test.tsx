import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { EMPTY_VITALS, makeEncounter, makeStoreState } from "./testFixtures";
import type { EncounterStoreState } from "./storeContract";

// Backing state the mocked hook reads from; reset per test.
let storeState: EncounterStoreState = makeStoreState();

// Mock the web-core store. Vitals reads only via selectors (encounter,
// measureVitals, advance, loading) — no getState() is needed.
vi.mock("../store/encounterStore", () => ({
  useEncounterStore: <T,>(selector?: (s: EncounterStoreState) => T) =>
    selector ? selector(storeState) : storeState,
}));

import { Vitals } from "./Vitals";

describe("Vitals stage", () => {
  beforeEach(() => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "VITALS",
        measuredVitals: { ...EMPTY_VITALS },
      }),
    });
  });

  it("renders the 'Vitals' heading", () => {
    render(<Vitals />);
    expect(screen.getByRole("heading", { name: /^vitals$/i })).toBeInTheDocument();
  });

  it("measures the selected vital when 'Measure selected' is clicked", () => {
    const measureVitals = vi.fn(async () => {});
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "VITALS",
        measuredVitals: { ...EMPTY_VITALS },
      }),
      measureVitals,
    });

    render(<Vitals />);

    // Unmeasured vitals render a shadcn Checkbox (role="checkbox") labelled by
    // their field label. Toggle Heart rate, then submit the selection.
    const heartRate = screen.getByRole("checkbox", { name: /heart rate/i });
    fireEvent.click(heartRate);
    fireEvent.click(screen.getByRole("button", { name: /measure selected/i }));

    expect(measureVitals).toHaveBeenCalledTimes(1);
    expect(measureVitals).toHaveBeenCalledWith(
      expect.arrayContaining(["heartRate"]),
    );
  });

  it("disables 'Proceed to ESI' until something has been measured", () => {
    // Nothing measured yet (EMPTY_VITALS) → proceed is disabled.
    render(<Vitals />);
    expect(
      screen.getByRole("button", { name: /proceed to esi/i }),
    ).toBeDisabled();
  });

  it("enables 'Proceed to ESI' once a vital has been measured", () => {
    storeState = makeStoreState({
      encounter: makeEncounter({
        stage: "VITALS",
        measuredVitals: { ...EMPTY_VITALS, heartRate: 88 },
      }),
    });

    render(<Vitals />);
    expect(
      screen.getByRole("button", { name: /proceed to esi/i }),
    ).toBeEnabled();
  });
});
