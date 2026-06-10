// CASE_LOAD stage: trainee reads the chief complaint, then begins history-taking.
// Reads the encounter from the store; advances to HISTORY via the store action.

import { useEncounterStore } from "../store/encounterStore";

export function CaseLoad(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  if (!encounter) {
    return <p className="stage__empty">No active encounter.</p>;
  }

  return (
    <section className="stage stage--case-load" aria-label="Case">
      <h2 className="stage__title">Chief complaint</h2>
      <p className="case-load__chief-complaint">{encounter.chiefComplaint}</p>
      <p className="case-load__hint">
        Take a history from the patient to uncover the relevant findings, then
        measure vitals, assign an ESI level, and order interventions.
      </p>
      <button
        type="button"
        className="stage__advance"
        disabled={loading}
        onClick={() => {
          void advance("HISTORY");
        }}
      >
        Begin history
      </button>
    </section>
  );
}
