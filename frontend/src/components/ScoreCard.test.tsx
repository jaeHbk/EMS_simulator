import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreCard } from "./ScoreCard";
import { makeScoreReport } from "../workflow/testFixtures";

describe("ScoreCard", () => {
  it("renders a prominent UNDER_TRIAGE safety warning", () => {
    render(<ScoreCard report={makeScoreReport("UNDER_TRIAGE")} />);

    // The under-triage banner is an assertive alert.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-direction", "UNDER_TRIAGE");
    expect(alert).toHaveTextContent(/under-triage/i);
    expect(alert).toHaveTextContent(/safety warning/i);
    expect(alert).toHaveTextContent(/less acute/i);
  });

  it("does not render an alert for a correct triage", () => {
    render(<ScoreCard report={makeScoreReport("CORRECT")} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/correct triage/i)).toBeInTheDocument();
  });

  it("treats over-triage as a caution, not the headline danger", () => {
    render(<ScoreCard report={makeScoreReport("OVER_TRIAGE")} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-direction", "OVER_TRIAGE");
    expect(status).toHaveTextContent(/over-triage/i);
  });

  it("lists missed red flags when present", () => {
    const report = makeScoreReport("UNDER_TRIAGE", {
      missedRedFlags: ["Diaphoresis", "Radiation to left arm"],
    });
    render(<ScoreCard report={report} />);
    expect(screen.getByText("Diaphoresis")).toBeInTheDocument();
    expect(screen.getByText("Radiation to left arm")).toBeInTheDocument();
  });

  it("shows assigned vs expert ESI levels", () => {
    render(<ScoreCard report={makeScoreReport("UNDER_TRIAGE")} />);
    expect(screen.getByText(/ESI 4/)).toBeInTheDocument();
    expect(screen.getByText(/ESI 2/)).toBeInTheDocument();
  });
});
