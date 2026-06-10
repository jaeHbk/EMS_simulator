// VITALS stage: trainee selects which vitals to measure, then submits. The server
// reveals ground-truth values only for measured fields (encounter.measuredVitals).
// Once measured, fields are shown and locked. "Proceed to ESI" advances.

import { useMemo, useState } from "react";
import { Activity, ArrowRight, Gauge } from "lucide-react";

import { VitalsGrid } from "../components/VitalsGrid";
import type { VitalKey } from "../components/VitalsGrid";
import { useEncounterStore } from "../store/encounterStore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

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
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No active encounter.
        </CardContent>
      </Card>
    );
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
    <Card aria-label="Vitals" className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="stage__title text-lg font-semibold leading-none tracking-tight">Vitals</h2>
        </div>
        <CardDescription>
          Select the vitals you want to measure. Values are revealed only for
          vitals you choose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <VitalsGrid
          selected={pending}
          measured={measured}
          disabled={loading}
          onToggle={toggle}
        />
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={loading || pending.size === 0}
          onClick={measureSelected}
        >
          <Gauge aria-hidden="true" />
          Measure selected
        </Button>
        <Button
          type="button"
          disabled={loading || !hasMeasuredAny}
          onClick={() => {
            void advance("ESI_ASSIGNMENT");
          }}
        >
          Proceed to ESI
          <ArrowRight aria-hidden="true" />
        </Button>
      </CardFooter>
    </Card>
  );
}
