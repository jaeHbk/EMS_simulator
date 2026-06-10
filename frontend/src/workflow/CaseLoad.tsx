// CASE_LOAD stage: trainee reads the chief complaint, then begins history-taking.
// Reads the encounter from the store; advances to HISTORY via the store action.

import { ArrowRight, ClipboardList, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEncounterStore } from "../store/encounterStore";

export function CaseLoad(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  if (!encounter) {
    return (
      <Card className="stage stage--case-load">
        <CardContent className="stage__empty flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <ClipboardList className="size-8 text-muted-foreground/70" aria-hidden="true" />
          <p>No active encounter.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="stage stage--case-load" aria-label="Case">
      <CardHeader className="gap-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Stethoscope className="size-4" aria-hidden="true" />
          <span className="uppercase tracking-wide">New patient encounter</span>
        </div>
        <h2 className="stage__title text-lg font-semibold leading-none tracking-tight">
          Chief complaint
        </h2>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          className={cn(
            "case-load__chief-complaint",
            "rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3",
            "text-lg font-medium leading-snug text-foreground",
          )}
        >
          {encounter.chiefComplaint}
        </div>

        <p className="case-load__hint text-sm leading-relaxed text-muted-foreground">
          Take a history from the patient to uncover the relevant findings, then
          measure vitals, assign an ESI level, and order interventions.
        </p>
      </CardContent>

      <CardFooter>
        <Button
          type="button"
          className="stage__advance"
          disabled={loading}
          onClick={() => {
            void advance("HISTORY");
          }}
        >
          <Stethoscope aria-hidden="true" />
          Begin history
          <ArrowRight aria-hidden="true" />
        </Button>
      </CardFooter>
    </Card>
  );
}
