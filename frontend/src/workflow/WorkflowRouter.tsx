// WorkflowRouter: the top of the stage tree. Reads `encounter.stage` from the
// store and renders the matching stage component, with a StepIndicator above it
// showing STAGE_ORDER progress. Handles the null/no-encounter state by prompting
// the trainee to start. Consumes the store ONLY via the documented hook/actions.

import { useEffect, useRef } from "react";
import { AlertCircle, ClipboardList } from "lucide-react";

import type { Stage } from "../api/contract";
import { useEncounterStore } from "../store/encounterStore";
import { StepIndicator } from "./StepIndicator";
import { CaseLoad } from "./CaseLoad";
import { History } from "./History";
import { Vitals } from "./Vitals";
import { EsiAssignment } from "./EsiAssignment";
import { Interventions } from "./Interventions";
import { Feedback } from "./Feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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

  // Stage-change focus management: when the stage changes (and on first mount of
  // a stage), move keyboard focus to the new stage region so screen-reader users
  // land on the new content instead of being stranded where the prior stage was.
  // The region is a focusable container (tabIndex -1, focus-visible suppressed)
  // wrapping the rendered stage; its heading remains the real <h2> the stage owns.
  const stage = encounter?.stage ?? null;
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (stage === null) return;
    const el = stageRef.current;
    if (!el) return;
    el.focus?.({ preventScroll: true });
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    el.scrollIntoView?.({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [stage]);

  // No-encounter state: prompt to start.
  if (!encounter) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            No active encounter. Start one to begin triaging a patient.
          </p>
          <Button
            type="button"
            disabled={loading}
            onClick={() => {
              void createEncounter();
            }}
          >
            {loading ? "Loading…" : "Start new encounter"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const StageComponent = STAGE_COMPONENTS[encounter.stage];

  return (
    <div className="flex flex-col gap-6" data-stage={encounter.stage}>
      <Card>
        <CardHeader className="py-4">
          <StepIndicator current={encounter.stage} />
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        ref={stageRef}
        tabIndex={-1}
        data-stage-region={encounter.stage}
        className="outline-none"
      >
        <StageComponent />
      </div>
    </div>
  );
}
