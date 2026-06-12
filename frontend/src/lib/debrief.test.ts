import { describe, expect, it } from "vitest";
import { buildDebriefMarkdown } from "./debrief";
import {
  makeEncounter,
  makeScoreReport,
} from "../workflow/testFixtures";

describe("buildDebriefMarkdown", () => {
  it("includes the chief complaint", () => {
    const md = buildDebriefMarkdown(
      makeEncounter({
        stage: "FEEDBACK",
        chiefComplaint: "Crushing chest pain",
      }),
    );
    expect(md).toContain("## Chief complaint");
    expect(md).toContain("Crushing chest pain");
  });

  it("renders both transcript roles as You / Patient lines", () => {
    const md = buildDebriefMarkdown(
      makeEncounter({
        stage: "FEEDBACK",
        history: [
          { role: "trainee", text: "When did the pain start?" },
          { role: "patient", text: "About two hours ago." },
        ],
      }),
    );
    expect(md).toContain("**You:** When did the pain start?");
    expect(md).toContain("**Patient:** About two hours ago.");
  });

  it("includes the assigned vs expert ESI line and triage direction", () => {
    const md = buildDebriefMarkdown(
      makeEncounter({
        stage: "FEEDBACK",
        scoreReport: makeScoreReport("UNDER_TRIAGE"),
      }),
    );
    // UNDER_TRIAGE fixture assigns 4, expert 2.
    expect(md).toContain("assigned 4");
    expect(md).toContain("expert 2");
    expect(md).toContain("Under-triage");
  });

  it("includes the overall percent, dimension labels, and missed red flags", () => {
    const md = buildDebriefMarkdown(
      makeEncounter({
        stage: "FEEDBACK",
        scoreReport: makeScoreReport("UNDER_TRIAGE", {
          overallPercent: 42,
          missedRedFlags: ["Hypotension"],
          narrative: "Watch for under-triage of cardiac presentations.",
        }),
      }),
    );
    expect(md).toContain("**Overall:** 42%");
    expect(md).toContain("ESI accuracy");
    expect(md).toContain("### Missed red flags");
    expect(md).toContain("- Hypotension");
    expect(md).toContain("## Teaching feedback");
    expect(md).toContain("Watch for under-triage");
  });

  it("omits the score sections when the encounter is not yet scored", () => {
    const md = buildDebriefMarkdown(
      makeEncounter({ stage: "FEEDBACK", scoreReport: null }),
    );
    expect(md).toContain("# ED Triage Trainer — Debrief");
    expect(md).not.toContain("## Score report");
    expect(md).not.toContain("## Teaching feedback");
  });
});
