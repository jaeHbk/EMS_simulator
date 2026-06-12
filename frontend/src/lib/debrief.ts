// Pure, dependency-free Markdown builder for the Feedback-stage debrief. Renders an
// Encounter into a portable record an instructor or learner can keep: chief complaint,
// the full history transcript, the deterministic score report (assigned vs expert ESI
// + triage direction, overall %, per-dimension scores, missed red flags) and the LLM
// narrative. Extracted so it can be unit-tested without rendering the stage.

import type { Encounter } from "../api/contract";

const TRIAGE_DIRECTION_LABEL: Record<string, string> = {
  CORRECT: "Correct triage",
  OVER_TRIAGE: "Over-triage",
  UNDER_TRIAGE: "Under-triage (safety warning)",
};

/**
 * Build the debrief Markdown for an encounter. Pure: no DOM, no I/O. Safe to call
 * whether or not the encounter has been scored — sections that need data are omitted
 * rather than emitting empty headings.
 */
export function buildDebriefMarkdown(encounter: Encounter): string {
  const lines: string[] = [];

  lines.push("# ED Triage Trainer — Debrief");
  lines.push("");
  lines.push(`- **Encounter:** ${encounter.encounterId}`);
  lines.push(`- **Case:** ${encounter.caseId}`);
  if (encounter.startedAt) {
    lines.push(`- **Started:** ${encounter.startedAt}`);
  }
  lines.push("");

  lines.push("## Chief complaint");
  lines.push("");
  lines.push(encounter.chiefComplaint || "—");
  lines.push("");

  lines.push("## History transcript");
  lines.push("");
  if (encounter.history.length === 0) {
    lines.push("_No history was taken._");
  } else {
    for (const turn of encounter.history) {
      const speaker = turn.role === "trainee" ? "You" : "Patient";
      lines.push(`**${speaker}:** ${turn.text}`);
      lines.push("");
    }
    // Drop the trailing blank we just pushed so spacing stays uniform below.
    lines.pop();
  }
  lines.push("");

  const report = encounter.scoreReport;
  if (report) {
    const { esi, dimensions, overallPercent, missedRedFlags, narrative } = report;
    const directionLabel =
      TRIAGE_DIRECTION_LABEL[esi.triageDirection] ?? esi.triageDirection;

    lines.push("## Score report");
    lines.push("");
    lines.push(
      `- **ESI:** assigned ${esi.assigned} · expert ${esi.expert} — ${directionLabel}`,
    );
    lines.push(`- **Overall:** ${Math.round(overallPercent)}%`);
    lines.push("");

    lines.push("### Performance breakdown");
    lines.push("");
    for (const dim of dimensions) {
      const pct = Math.round(dim.score * 100);
      const na = dim.weight === 0 ? " (n/a)" : "";
      lines.push(`- **${dim.label}:** ${pct}%${na}`);
    }
    lines.push("");

    if (missedRedFlags.length > 0) {
      lines.push("### Missed red flags");
      lines.push("");
      for (const flag of missedRedFlags) {
        lines.push(`- ${flag}`);
      }
      lines.push("");
    }

    if (narrative) {
      lines.push("## Teaching feedback");
      lines.push("");
      lines.push(narrative);
      lines.push("");
    }
  }

  // Join and collapse any run of 3+ blank lines down to a single blank line so the
  // section spacing stays tidy regardless of which optional blocks were emitted.
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
