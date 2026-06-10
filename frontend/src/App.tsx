// App shell: header (name + mandatory disclaimer), a "Start new encounter"
// control, and the stage workflow. All stage rendering belongs to the
// web-stages owner via <WorkflowRouter/>; this shell only frames it and exposes
// the store-backed "start" action.

import { WorkflowRouter } from "./workflow/WorkflowRouter";
import {
  useEncounter,
  useEncounterActions,
  useError,
  useLoading,
} from "./store/encounterStore";

/**
 * Required in-product disclaimer (AGENTS.md rule 7 / CLAUDE.md hard rules).
 * Exported so it can be reused/asserted on without duplicating the string.
 */
export const DISCLAIMER =
  "Educational training tool — not a medical device. De-identified/synthetic data only.";

export const APP_NAME = "ED Triage Trainer";

export default function App(): JSX.Element {
  const encounter = useEncounter();
  const loading = useLoading();
  const error = useError();
  const { createEncounter, clearError } = useEncounterActions();

  const startLabel = encounter ? "Start new encounter" : "Start encounter";

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__titlebar">
          <h1 className="app__title">{APP_NAME}</h1>
          <button
            type="button"
            className="app__start"
            onClick={() => void createEncounter()}
            disabled={loading}
          >
            {loading ? "Starting…" : startLabel}
          </button>
        </div>
        <p className="app__disclaimer" role="note">
          {DISCLAIMER}
        </p>
      </header>

      {error !== null && (
        <div className="app__error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="app__error-dismiss"
            onClick={() => clearError()}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <main className="app__main">
        {encounter ? (
          <WorkflowRouter />
        ) : (
          <div className="app__empty">
            <p>No active encounter. Start one to begin triage training.</p>
          </div>
        )}
      </main>
    </div>
  );
}
