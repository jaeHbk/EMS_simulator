// WorkflowRouter: the top of the stage tree. Reads `encounter.stage` from the
// store and renders the matching stage component, with a StepIndicator above it
// showing STAGE_ORDER progress. Handles the null/no-encounter state by prompting
// the trainee to start. Consumes the store ONLY via the documented hook/actions.

import type { Stage } from "../api/contract";
import { useEncounterStore } from "../store/encounterStore";
import { StepIndicator } from "./StepIndicator";
import { CaseLoad } from "./CaseLoad";
import { History } from "./History";
import { Vitals } from "./Vitals";
import { EsiAssignment } from "./EsiAssignment";
import { Interventions } from "./Interventions";
import { Feedback } from "./Feedback";

const STAGE_COMPONENTS: Record<Stage, () => JSX.Element> = {
  CASE_LOAD: CaseLoad,
  HISTORY: History,
  VITALS: Vitals,
  ESI_ASSIGNMENT: EsiAssignment,
  INTERVENTIONS: Interventions,
  FEEDBACK: Feedback,
};

export function WorkflowRouter(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const error = useEncounterStore((s) => s.error);
  const loading = useEncounterStore((s) => s.loading);
  const createEncounter = useEncounterStore((s) => s.createEncounter);

  // No-encounter state: prompt to start.
  if (!encounter) {
    return (
      <div className="workflow workflow--empty">
        {error && (
          <p className="workflow__error" role="alert">
            {error}
          </p>
        )}
        <p className="workflow__prompt">
          No active encounter. Start one to begin triaging a patient.
        </p>
        <button
          type="button"
          className="workflow__start"
          disabled={loading}
          onClick={() => {
            void createEncounter();
          }}
        >
          {loading ? "Loading…" : "Start new encounter"}
        </button>
      </div>
    );
  }

  const StageComponent = STAGE_COMPONENTS[encounter.stage];

  return (
    <div className="workflow" data-stage={encounter.stage}>
      <StepIndicator current={encounter.stage} />
      {error && (
        <p className="workflow__error" role="alert">
          {error}
        </p>
      )}
      <div className="workflow__stage">
        <StageComponent />
      </div>
    </div>
  );
}
