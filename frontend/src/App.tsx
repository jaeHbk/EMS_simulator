// App shell: header (name + mandatory disclaimer), a "Start new encounter"
// control, and the stage workflow. All stage rendering belongs to the
// web-stages owner via <WorkflowRouter/>; this shell only frames it and exposes
// the store-backed "start" action.

import { useEffect } from "react";
import { Activity, ClipboardList, ShieldAlert, X } from "lucide-react";

import { WorkflowRouter } from "./workflow/WorkflowRouter";
import { PatientRail } from "./components/PatientRail";
import { ProgressPanel } from "./components/ProgressPanel";
import {
  useAnalytics,
  useEncounter,
  useEncounterActions,
  useError,
  useLoading,
} from "./store/encounterStore";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  const analytics = useAnalytics();
  const { createEncounter, resume, fetchAnalytics, clearError } =
    useEncounterActions();

  const startLabel = encounter ? "Start new encounter" : "Start encounter";

  // Rehydrate the active encounter on load: a refresh / tab reload / projector
  // hiccup mid-encounter would otherwise discard everything. Runs once on mount,
  // independently of the analytics effect below. A no-op when nothing is stored.
  useEffect(() => {
    void resume();
  }, [resume]);

  // Refresh the learning curve on mount and whenever a case completes scoring
  // (FEEDBACK) or the trainee returns to the empty state. `stage` (a primitive)
  // is the dependency so the fetch fires once per relevant transition, not on
  // every in-stage re-render.
  const stage = encounter?.stage ?? null;
  useEffect(() => {
    if (stage === null || stage === "FEEDBACK") {
      void fetchAnalytics();
    }
  }, [stage, fetchAnalytics]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Activity className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight">{APP_NAME}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void createEncounter()}
              disabled={loading}
            >
              <ClipboardList />
              {loading ? "Starting…" : startLabel}
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <div className="border-t border-border bg-warning/10">
          <p
            className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground sm:px-6"
            role="note"
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
            {DISCLAIMER}
          </p>
        </div>
      </header>

      {error !== null && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span className="flex-1">{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => clearError()}
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <PatientRail />
          </aside>

          <section className="min-w-0">
            {encounter ? (
              <WorkflowRouter />
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ClipboardList className="h-6 w-6" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No active encounter. Start one to begin triage training.
                    </p>
                  </CardContent>
                </Card>
                <ProgressPanel analytics={analytics} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
