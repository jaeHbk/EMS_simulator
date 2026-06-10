// VITALS stage: trainee selects which vitals to measure, then submits. The server
// reveals ground-truth values only for measured fields (encounter.measuredVitals).
// Once measured, fields are shown and locked. "Proceed to ESI" advances.

import { useMemo, useState } from "react";
import { VitalsGrid } from "../components/VitalsGrid";
import type { VitalKey } from "../components/VitalsGrid";
import { useEncounterStore } from "../store/encounterStore";

export function Vitals(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const measureVitals = useEncounterStore((s) => s.measureVitals);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  // Local pending selection (not yet submitted). Already-measured fields are
  // driven by encounter.measuredVitals and locked in the grid.
  const [pending, setPending] = useState<Set<VitalKey>>(new Set());

  const measured = encounter?.measuredVitals;

  const hasMeasuredAny = useMemo(() => {
    if (!measured) {
      return false;
    }
    return Object.values(measured).some((v) => v !== null && v !== undefined);
  }, [measured]);

  if (!encounter || !measured) {
    return <p className="stage__empty">No active encounter.</p>;
  }

  const toggle = (key: VitalKey): void => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const measureSelected = (): void => {
    if (pending.size === 0) {
      return;
    }
    void measureVitals([...pending]).then(() => setPending(new Set()));
  };

  return (
    <section className="stage stage--vitals" aria-label="Vitals">
      <h2 className="stage__title">Vitals</h2>
      <p className="stage__hint">
        Select the vitals you want to measure. Values are revealed only for
        vitals you choose.
      </p>
      <VitalsGrid
        selected={pending}
        measured={measured}
        disabled={loading}
        onToggle={toggle}
      />
      <div className="stage__actions">
        <button
          type="button"
          className="stage__measure"
          disabled={loading || pending.size === 0}
          onClick={measureSelected}
        >
          Measure selected
        </button>
        <button
          type="button"
          className="stage__advance"
          disabled={loading || !hasMeasuredAny}
          onClick={() => {
            void advance("ESI_ASSIGNMENT");
          }}
        >
          Proceed to ESI
        </button>
      </div>
    </section>
  );
}
