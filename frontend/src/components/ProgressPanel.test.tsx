import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProgressPanel } from "./ProgressPanel";
import { makeAnalytics, makeAnalyticsPoint } from "../workflow/testFixtures";

describe("ProgressPanel", () => {
  it("renders the under-triage and correct rates as percentages", () => {
    const analytics = makeAnalytics({
      totalEncounters: 4,
      underTriageRate: 0.25,
      correctRate: 0.5,
      history: [
        makeAnalyticsPoint("UNDER_TRIAGE", { encounterId: "e1" }),
        makeAnalyticsPoint("CORRECT", { encounterId: "e2" }),
        makeAnalyticsPoint("CORRECT", { encounterId: "e3" }),
        makeAnalyticsPoint("OVER_TRIAGE", { encounterId: "e4" }),
      ],
    });
    render(<ProgressPanel analytics={analytics} />);

    expect(
      screen.getByRole("heading", { name: /your progress/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument(); // under-triage
    expect(screen.getByText("50%")).toBeInTheDocument(); // correct
    expect(screen.getByText("4")).toBeInTheDocument(); // total encounters
  });

  it("renders one chip per history point with the right label per direction", () => {
    const analytics = makeAnalytics({
      history: [
        makeAnalyticsPoint("UNDER_TRIAGE", { encounterId: "e1" }),
        makeAnalyticsPoint("OVER_TRIAGE", { encounterId: "e2" }),
        makeAnalyticsPoint("CORRECT", { encounterId: "e3" }),
      ],
    });
    render(<ProgressPanel analytics={analytics} />);

    const chips = screen.getAllByRole("img");
    expect(chips).toHaveLength(3);
    expect(screen.getByLabelText("Under-triage")).toBeInTheDocument();
    expect(screen.getByLabelText("Over-triage")).toBeInTheDocument();
    expect(screen.getByLabelText("Correct")).toBeInTheDocument();
  });

  it("gives the under-triage chip a non-color marker (letter + aria-label)", () => {
    const analytics = makeAnalytics({
      history: [makeAnalyticsPoint("UNDER_TRIAGE", { encounterId: "e1" })],
    });
    render(<ProgressPanel analytics={analytics} />);

    const chip = screen.getByLabelText("Under-triage");
    // The marker survives without color: a distinguishing letter and a
    // data-direction hook, not color alone.
    expect(chip).toHaveTextContent("U");
    expect(chip).toHaveAttribute("data-direction", "UNDER_TRIAGE");
  });

  it("renders the empty state when analytics is null", () => {
    render(<ProgressPanel analytics={null} />);
    expect(
      screen.getByText(/complete an encounter to see your progress/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the empty state when there are zero encounters", () => {
    const analytics = makeAnalytics({ totalEncounters: 0, history: [] });
    render(<ProgressPanel analytics={analytics} />);
    expect(
      screen.getByText(/complete an encounter to see your progress/i),
    ).toBeInTheDocument();
  });
});
