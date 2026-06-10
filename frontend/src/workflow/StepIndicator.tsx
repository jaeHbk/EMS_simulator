// StepIndicator: shows STAGE_ORDER progress. Presentational — given the current
// stage it highlights completed / current / upcoming steps. No store access.

import { Check } from "lucide-react";

import { STAGE_ORDER } from "../api/contract";
import type { Stage } from "../api/contract";
import { cn } from "@/lib/utils";

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
    <nav aria-label="Workflow progress" className="w-full">
      <ol className="flex w-full items-start">
        {STAGE_ORDER.map((stage, i) => {
          const status =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
          const isCurrent = status === "current";
          const isDone = status === "done";
          const isLast = i === STAGE_ORDER.length - 1;

          return (
            <li
              key={stage}
              className={cn(
                "step-indicator__step relative flex flex-1 flex-col items-center gap-1.5 text-center",
                isLast && "flex-none",
              )}
              data-stage={stage}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex w-full items-center">
                {/* Left connector (hidden for the first step). */}
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors",
                      i <= currentIndex ? "bg-primary" : "bg-border",
                    )}
                  />
                )}

                {/* Numbered circle. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    isDone &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-background text-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                    status === "todo" &&
                      "border-border bg-muted text-muted-foreground",
                    !isLast && "mx-1",
                    isLast && "ml-1",
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : i + 1}
                </span>

                {/* Right connector (hidden for the last step). */}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors",
                      i < currentIndex ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </div>

              <span
                className={cn(
                  "text-xs leading-tight transition-colors",
                  isCurrent
                    ? "font-semibold text-foreground"
                    : isDone
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
