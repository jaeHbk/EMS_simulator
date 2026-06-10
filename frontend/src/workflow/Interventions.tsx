// INTERVENTIONS stage: trainee multi-selects critical interventions, submits them
// via the store (postInterventions), then requests feedback. The `/feedback` route
// performs the FEEDBACK transition + scoring + narrative atomically server-side, so
// the client calls requestFeedback() directly from INTERVENTIONS — it must NOT
// advance to FEEDBACK first (that would move the stage with no score, and the
// feedback call would then be an illegal FEEDBACK -> FEEDBACK transition).

import { useEffect, useState } from "react";
import { ClipboardList, ArrowRight } from "lucide-react";
import { InterventionPicker } from "../components/InterventionPicker";
import type { CriticalIntervention } from "../api/contract";
import { useEncounterStore } from "../store/encounterStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Interventions(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const orderInterventions = useEncounterStore((s) => s.orderInterventions);
  const requestFeedback = useEncounterStore((s) => s.requestFeedback);
  const loading = useEncounterStore((s) => s.loading);
  // Store actions swallow errors (they set `error` and resolve), so we must gate
  // the feedback request on the success of the order — checking the store error
  // after the first call rather than chaining unconditionally on .then().

  // Seed local selection from whatever is already recorded on the encounter.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const recorded = encounter?.interventionsOrdered;
  useEffect(() => {
    if (recorded) {
      setSelected(new Set(recorded));
    }
  }, [recorded]);

  if (!encounter) {
    return <p className="stage__empty text-sm text-muted-foreground">No active encounter.</p>;
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
    // Record the selection; only request feedback if that succeeded. The store
    // captures failures into `error` instead of rejecting, so read it back rather
    // than chaining on .then() (which would fire even on a failed order and post
    // /feedback against a server that never recorded the interventions).
    void (async () => {
      await orderInterventions([...selected]);
      if (!useEncounterStore.getState().error) {
        await requestFeedback();
      }
    })();
  };

  const selectedCount = selected.size;

  return (
    <section className="stage stage--interventions" aria-label="Interventions">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="size-5" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <h2 className="stage__title text-lg font-semibold leading-none tracking-tight">
                  Critical interventions
                </h2>
                <CardDescription>
                  Select every critical intervention you would initiate at triage.
                </CardDescription>
              </div>
            </div>
            <Badge variant={selectedCount > 0 ? "default" : "secondary"} className="shrink-0">
              {selectedCount} selected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <InterventionPicker selected={selected} onToggle={toggle} disabled={loading} />
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="button"
            className="stage__advance"
            disabled={loading}
            onClick={submitAndAdvance}
          >
            {loading ? "Submitting…" : "Submit and see feedback"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
