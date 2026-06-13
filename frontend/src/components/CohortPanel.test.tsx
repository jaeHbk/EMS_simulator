import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { CohortPanel } from "./CohortPanel";
import { makeCohortAnalytics, makeCohortTraineeRow } from "../workflow/testFixtures";

describe("CohortPanel", () => {
  it("renders the heading and the aggregate under-triage / correct rates", () => {
    const analytics = makeCohortAnalytics({
      totalTrainees: 3,
      totalEncounters: 8,
      underTriageRate: 0.25,
      correctRate: 0.55,
      byDifficulty: null,
      // A single trainee with rates that don't collide with the aggregate tiles.
      trainees: [
        makeCohortTraineeRow({
          traineeId: "trainee-only",
          underTriageRate: 0.33,
          correctRate: 0.66,
          totalEncounters: 8,
        }),
      ],
    });
    render(<CohortPanel analytics={analytics} />);

    expect(
      screen.getByRole("heading", { name: /cohort overview/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument(); // cohort under-triage
    expect(screen.getByText("55%")).toBeInTheDocument(); // cohort correct
    expect(screen.getByText("3")).toBeInTheDocument(); // total trainees
    // 8 appears in both the encounters tile and the trainee row's count.
    expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(1);
  });

  it("renders one row per trainee, in the given (struggling-first) array order", () => {
    const analytics = makeCohortAnalytics({
      trainees: [
        makeCohortTraineeRow({
          traineeId: "trainee-worst",
          underTriageRate: 0.9,
          correctRate: 0.1,
          totalEncounters: 5,
        }),
        makeCohortTraineeRow({
          traineeId: "trainee-middle",
          underTriageRate: 0.4,
          correctRate: 0.5,
          totalEncounters: 3,
        }),
        makeCohortTraineeRow({
          traineeId: "trainee-best",
          underTriageRate: 0.0,
          correctRate: 0.9,
          totalEncounters: 2,
        }),
      ],
    });
    render(<CohortPanel analytics={analytics} />);

    const rows = screen
      .getAllByRole("row")
      .filter((r) => r.getAttribute("data-trainee-id") !== null);
    expect(rows).toHaveLength(3);
    // Rendered in the order the array (already sorted by the backend) provides.
    expect(rows[0]).toHaveAttribute("data-trainee-id", "trainee-worst");
    expect(rows[1]).toHaveAttribute("data-trainee-id", "trainee-middle");
    expect(rows[2]).toHaveAttribute("data-trainee-id", "trainee-best");
  });

  it("shows each row's under-triage value with a non-color text cue", () => {
    const analytics = makeCohortAnalytics({
      trainees: [
        makeCohortTraineeRow({ traineeId: "trainee-x", underTriageRate: 0.6 }),
      ],
    });
    render(<CohortPanel analytics={analytics} />);

    const row = screen
      .getAllByRole("row")
      .find((r) => r.getAttribute("data-trainee-id") === "trainee-x");
    expect(row).toBeDefined();
    const scope = within(row as HTMLElement);
    // The under-triage cell carries both the percentage and a textual "under"
    // tag + aria-label, so the meaning survives without color.
    expect(scope.getByText("60%", { exact: false })).toBeInTheDocument();
    expect(scope.getByText("under")).toBeInTheDocument();
    expect(
      scope.getByLabelText(/under-triage 60 percent/i),
    ).toBeInTheDocument();
  });

  it("renders the trap-vs-standard split when byDifficulty is present", () => {
    const analytics = makeCohortAnalytics({
      byDifficulty: {
        trap: { totalEncounters: 4, underTriageRate: 0.72 },
        standard: { totalEncounters: 6, underTriageRate: 0.08 },
      },
      // Trainee rates chosen so they don't collide with the difficulty split %s.
      trainees: [
        makeCohortTraineeRow({ traineeId: "t1", underTriageRate: 0.5, correctRate: 0.4 }),
      ],
    });
    render(<CohortPanel analytics={analytics} />);

    expect(screen.getByText(/under-triage by difficulty/i)).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument(); // trap
    expect(screen.getByText("8%")).toBeInTheDocument(); // standard
  });

  it("renders the empty state when analytics is null", () => {
    render(<CohortPanel analytics={null} />);
    expect(
      screen.getByText(/no cohort data yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });

  it("renders the empty state when the cohort has zero encounters", () => {
    const analytics = makeCohortAnalytics({ totalEncounters: 0, trainees: [] });
    render(<CohortPanel analytics={analytics} />);
    expect(screen.getByText(/no cohort data yet/i)).toBeInTheDocument();
  });
});
