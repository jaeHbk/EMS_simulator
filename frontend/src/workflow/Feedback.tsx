// FEEDBACK stage: renders encounter.scoreReport via ScoreCard. ScoreCard already
// surfaces triageDirection (UNDER_TRIAGE as a prominent safety warning) and missed
// red flags; here we add the LLM narrative and a start-over control.

import { ScoreCard } from "../components/ScoreCard";
import { useEncounterStore } from "../store/encounterStore";

export function Feedback(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const createEncounter = useEncounterStore((s) => s.createEncounter);
  const loading = useEncounterStore((s) => s.loading);

  if (!encounter) {
    return <p className="stage__empty">No active encounter.</p>;
  }

  const report = encounter.scoreReport;

  return (
    <section className="stage stage--feedback" aria-label="Feedback">
      <h2 className="stage__title">Feedback</h2>

      {report ? (
        <>
          <ScoreCard report={report} />
          {report.narrative && (
            <div className="feedback__narrative" aria-label="Teaching feedback">
              <h3 className="feedback__narrative-heading">Teaching feedback</h3>
              <p className="feedback__narrative-text">{report.narrative}</p>
            </div>
          )}
        </>
      ) : (
        <p className="stage__empty">Scoring this encounter…</p>
      )}

      <button
        type="button"
        className="stage__advance"
        disabled={loading}
        onClick={() => {
          void createEncounter();
        }}
      >
        Start a new encounter
      </button>
    </section>
  );
}
