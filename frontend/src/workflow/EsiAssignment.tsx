// ESI_ASSIGNMENT stage: trainee picks an ESI level (1..5). The choice is recorded
// via the store (postEsi); no feedback is shown yet. "Proceed to interventions"
// advances once a level has been recorded on the encounter.

import { useState } from "react";
import { EsiSelector } from "../components/EsiSelector";
import { useEncounterStore } from "../store/encounterStore";

export function EsiAssignment(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const assignEsi = useEncounterStore((s) => s.assignEsi);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  // Local pending pick; the recorded value lives on encounter.esiAssigned.
  const [pending, setPending] = useState<number | null>(null);

  if (!encounter) {
    return <p className="stage__empty">No active encounter.</p>;
  }

  const recorded = encounter.esiAssigned;
  const shown = pending ?? recorded;

  const choose = (level: number): void => {
    setPending(level);
    void assignEsi(level);
  };

  return (
    <section className="stage stage--esi" aria-label="ESI assignment">
      <h2 className="stage__title">ESI assignment</h2>
      <p className="stage__hint">
        Assign the Emergency Severity Index level. ESI 1 is the most acute; ESI 5
        the least.
      </p>
      <EsiSelector value={shown} onSelect={choose} disabled={loading} />
      <button
        type="button"
        className="stage__advance"
        disabled={loading || recorded === null}
        onClick={() => {
          void advance("INTERVENTIONS");
        }}
      >
        Proceed to interventions
      </button>
    </section>
  );
}
