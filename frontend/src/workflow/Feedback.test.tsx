import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  describe("debrief print + export", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("renders Print and Export buttons when a score report is present", () => {
      storeState = makeStoreState({
        encounter: makeEncounter({
          stage: "FEEDBACK",
          scoreReport: makeScoreReport("CORRECT"),
        }),
      });
      render(<Feedback />);
      expect(
        screen.getByRole("button", { name: /print debrief/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^export$/i }),
      ).toBeInTheDocument();
    });

    it("hides Print and Export in the no-report placeholder state", () => {
      storeState = makeStoreState({
        encounter: makeEncounter({ stage: "FEEDBACK", scoreReport: null }),
      });
      render(<Feedback />);
      expect(
        screen.queryByRole("button", { name: /print debrief/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^export$/i }),
      ).not.toBeInTheDocument();
    });

    it("calls window.print when Print debrief is clicked", () => {
      const printSpy = vi
        .spyOn(window, "print")
        .mockImplementation(() => undefined);
      storeState = makeStoreState({
        encounter: makeEncounter({
          stage: "FEEDBACK",
          scoreReport: makeScoreReport("CORRECT"),
        }),
      });
      render(<Feedback />);
      fireEvent.click(screen.getByRole("button", { name: /print debrief/i }));
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it("triggers a Markdown download when Export is clicked", () => {
      // jsdom lacks URL.createObjectURL / revokeObjectURL — stub them.
      const createObjectURL = vi.fn((_blob: Blob) => "blob:mock");
      const revokeObjectURL = vi.fn((_url: string) => undefined);
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL,
        revokeObjectURL,
      });
      // Capture the transient anchor's download name when it's clicked. Spying on
      // click (not appendChild) avoids interfering with React's render into the body.
      let downloadName: string | null = null;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          downloadName = this.download;
        });

      storeState = makeStoreState({
        encounter: makeEncounter({
          encounterId: "enc-xyz",
          stage: "FEEDBACK",
          scoreReport: makeScoreReport("CORRECT"),
        }),
      });
      render(<Feedback />);
      fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

      // The transient anchor carried a .md download name keyed to the encounter.
      expect(downloadName).toBe("ed-triage-debrief-enc-xyz.md");

      vi.unstubAllGlobals();
    });
  });
});
