// ESI_ASSIGNMENT stage: trainee picks an ESI level (1..5). The choice is recorded
// via the store (postEsi); no feedback is shown yet. "Proceed to interventions"
// advances once a level has been recorded on the encounter.

import { useState } from "react";
import { ArrowRight, CheckCircle2, Gauge } from "lucide-react";
import { EsiSelector, ESI_LEVELS } from "../components/EsiSelector";
import { useEncounterStore } from "../store/encounterStore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function EsiAssignment(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const assignEsi = useEncounterStore((s) => s.assignEsi);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  // Local pending pick; the recorded value lives on encounter.esiAssigned.
  const [pending, setPending] = useState<number | null>(null);

  if (!encounter) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No active encounter.
        </CardContent>
      </Card>
    );
  }

  const recorded = encounter.esiAssigned;
  const shown = pending ?? recorded;

  const choose = (level: number): void => {
    setPending(level);
    void assignEsi(level);
  };

  const recordedMeta =
    recorded !== null
      ? ESI_LEVELS.find((m) => m.level === recorded)
      : undefined;

  return (
    <section aria-label="ESI assignment">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="stage__title text-lg font-semibold leading-none tracking-tight">
              ESI assignment
            </h2>
          </div>
          <CardDescription>
            Assign the Emergency Severity Index level. ESI 1 is the most acute;
            ESI 5 the least.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EsiSelector value={shown} onSelect={choose} disabled={loading} />
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          {recorded !== null ? (
            <Badge variant="success" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Recorded: ESI {recorded}
              {recordedMeta ? ` · ${recordedMeta.name}` : ""}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              Select a level to record your assignment.
            </span>
          )}
          <Button
            type="button"
            disabled={loading || recorded === null}
            onClick={() => {
              void advance("INTERVENTIONS");
            }}
          >
            Proceed to interventions
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
