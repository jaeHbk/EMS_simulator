// INTERVENTIONS stage: trainee multi-selects critical interventions, submits them
// via the store (postInterventions), then requests feedback. The `/feedback` route
// performs the FEEDBACK transition + scoring + narrative atomically server-side, so
// the client calls requestFeedback() directly from INTERVENTIONS — it must NOT
// advance to FEEDBACK first (that would move the stage with no score, and the
// feedback call would then be an illegal FEEDBACK -> FEEDBACK transition).

import { useEffect, useState } from "react";
import { InterventionPicker } from "../components/InterventionPicker";
import type { CriticalIntervention } from "../api/contract";
import { useEncounterStore } from "../store/encounterStore";

export function Interventions(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const orderInterventions = useEncounterStore((s) => s.orderInterventions);
  const requestFeedback = useEncounterStore((s) => s.requestFeedback);
  const loading = useEncounterStore((s) => s.loading);

  // Seed local selection from whatever is already recorded on the encounter.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const recorded = encounter?.interventionsOrdered;
  useEffect(() => {
    if (recorded) {
      setSelected(new Set(recorded));
    }
  }, [recorded]);

  if (!encounter) {
    return <p className="stage__empty">No active encounter.</p>;
  }

  const toggle = (key: CriticalIntervention): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const submitAndAdvance = (): void => {
    // Record the selection, then request feedback (server-side: advance to
    // FEEDBACK + score + narrative in one step).
    void orderInterventions([...selected]).then(() => requestFeedback());
  };

  return (
    <section className="stage stage--interventions" aria-label="Interventions">
      <h2 className="stage__title">Critical interventions</h2>
      <p className="stage__hint">
        Select every critical intervention you would initiate at triage.
      </p>
      <InterventionPicker
        selected={selected}
        onToggle={toggle}
        disabled={loading}
      />
      <button
        type="button"
        className="stage__advance"
        disabled={loading}
        onClick={submitAndAdvance}
      >
        Submit and see feedback
      </button>
    </section>
  );
}
