// StepIndicator: shows STAGE_ORDER progress. Presentational — given the current
// stage it highlights completed / current / upcoming steps. No store access.

import { STAGE_ORDER } from "../api/contract";
import type { Stage } from "../api/contract";

const STAGE_LABELS: Record<Stage, string> = {
  CASE_LOAD: "Case",
  HISTORY: "History",
  VITALS: "Vitals",
  ESI_ASSIGNMENT: "ESI",
  INTERVENTIONS: "Interventions",
  FEEDBACK: "Feedback",
};

export interface StepIndicatorProps {
  current: Stage;
}

export function StepIndicator({ current }: StepIndicatorProps): JSX.Element {
  const currentIndex = STAGE_ORDER.indexOf(current);

  return (
    <nav className="step-indicator" aria-label="Workflow progress">
      <ol className="step-indicator__list">
        {STAGE_ORDER.map((stage, i) => {
          const status =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
          return (
            <li
              key={stage}
              className={`step-indicator__step step-indicator__step--${status}`}
              data-stage={stage}
              aria-current={status === "current" ? "step" : undefined}
            >
              <span className="step-indicator__index">{i + 1}</span>
              <span className="step-indicator__label">
                {STAGE_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
