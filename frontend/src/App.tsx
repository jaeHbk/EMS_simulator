// App shell: header (name + mandatory disclaimer), a "Start new encounter"
// control, and the stage workflow. All stage rendering belongs to the
// web-stages owner via <WorkflowRouter/>; this shell only frames it and exposes
// the store-backed "start" action.

import { useEffect, useRef, useState } from "react";
import { Activity, ClipboardList, ShieldAlert, Users, X } from "lucide-react";

import { WorkflowRouter } from "./workflow/WorkflowRouter";
import { PatientRail } from "./components/PatientRail";
import { ProgressPanel } from "./components/ProgressPanel";
import { CohortPanel } from "./components/CohortPanel";
import {
  useAnalytics,
  useCohortAnalytics,
  useEncounter,
  useEncounterActions,
  useError,
  useLoading,
} from "./store/encounterStore";
import { clearCohortId, getCohortId, setCohortId } from "./lib/cohortId";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * Required in-product disclaimer (AGENTS.md rule 7 / CLAUDE.md hard rules).
 * Exported so it can be reused/asserted on without duplicating the string.
 */
export const DISCLAIMER =
  "Educational training tool — not a medical device. De-identified/synthetic data only.";

export const APP_NAME = "ED Triage Trainer";

/** Number of vitals fields that currently hold a (non-null) measured value. */
function countMeasuredVitals(encounter: ReturnType<typeof useEncounter>): number {
  if (!encounter) return 0;
  return Object.values(encounter.measuredVitals).filter((v) => v !== null).length;
}

export default function App(): JSX.Element {
  const encounter = useEncounter();
  const loading = useLoading();
  const error = useError();
  const analytics = useAnalytics();
  const cohortAnalytics = useCohortAnalytics();
  const { createEncounter, resume, fetchAnalytics, fetchCohortAnalytics, clearError } =
    useEncounterActions();

  const startLabel = encounter ? "Start new encounter" : "Start encounter";

  // Cohort mode is opt-in: the joined cohort code lives in localStorage (via the
  // cohortId lib). We mirror it into component state so the UI re-renders on
  // join/leave; `draft` holds the in-progress input before joining. `joinedCode`
  // is the source of truth for "are we in cohort mode" in the render below.
  const [joinedCode, setJoinedCode] = useState<string | null>(() => getCohortId());
  const [draft, setDraft] = useState("");

  const joinCohort = (): void => {
    const code = draft.trim();
    if (!code) return;
    setCohortId(code);
    setJoinedCode(code);
    setDraft("");
    void fetchCohortAnalytics();
  };

  const leaveCohort = (): void => {
    clearCohortId();
    setJoinedCode(null);
    // Drop the now-stale cohort aggregate (fetchCohortAnalytics nulls it out
    // since no cohort is joined).
    void fetchCohortAnalytics();
  };

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
      // Refresh the cohort aggregate at the same transitions (mount + after a
      // case scores). A no-cohort state makes fetchCohortAnalytics a cheap
      // null-out, so this is safe to call unconditionally.
      void fetchCohortAnalytics();
    }
  }, [stage, fetchAnalytics, fetchCohortAnalytics]);

  // --- App-level polite status announcements for assistive tech ---
  // Async outcomes (a patient reply, vitals coming back, a score) and the start
  // of an encounter are otherwise invisible to screen readers. We derive one
  // concise message per meaningful transition by comparing the current store
  // state to the previous values held in a ref. The message is rendered into a
  // visually-hidden aria-live="polite" region below, so it's announced without
  // moving focus. Only transitions push a message — never on plain re-renders.
  const [announcement, setAnnouncement] = useState("");
  const encounterId = encounter?.encounterId ?? null;
  const historyLength = encounter?.history.length ?? 0;
  const lastTurnRole =
    historyLength > 0 ? encounter?.history[historyLength - 1]?.role : undefined;
  const measuredCount = countMeasuredVitals(encounter);
  const hasScore = encounter?.scoreReport != null || stage === "FEEDBACK";

  const prev = useRef<{
    encounterId: string | null;
    historyLength: number;
    measuredCount: number;
    hasScore: boolean;
  }>({
    encounterId: null,
    historyLength: 0,
    measuredCount: 0,
    hasScore: false,
  });

  useEffect(() => {
    const before = prev.current;
    let message: string | null = null;

    if (encounterId !== null && encounterId !== before.encounterId) {
      // A new encounter id appeared (created or resumed): announce the start and
      // reset the per-encounter baselines so we don't mis-fire on the rehydrated
      // history/vitals/score this same render carries.
      message = "Encounter started.";
    } else if (encounterId !== null && encounterId === before.encounterId) {
      // Same encounter: report the most salient single transition this render.
      if (hasScore && !before.hasScore) {
        message = "Score ready.";
      } else if (
        historyLength > before.historyLength &&
        lastTurnRole === "patient"
      ) {
        message = "Patient replied.";
      } else if (measuredCount > before.measuredCount) {
        message = "Vitals measured.";
      }
    }

    prev.current = { encounterId, historyLength, measuredCount, hasScore };

    if (message !== null) {
      setAnnouncement(message);
    }
  }, [encounterId, historyLength, lastTurnRole, measuredCount, hasScore]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Visually-hidden polite status region: announces key async transitions
          (encounter start, patient replies, vitals measured, score ready) to
          assistive tech without stealing focus. Fed by the effect above. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

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

                {/* Cohort mode (opt-in). Join with a code to tag new encounters
                    into an instructor's aggregate; the dashboard appears once a
                    cohort is active. */}
                <Card className="cohort-join">
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                      <h2 className="font-semibold leading-none tracking-tight">
                        Cohort mode
                      </h2>
                    </div>
                    {joinedCode === null ? (
                      <form
                        className="flex flex-col gap-2 sm:flex-row sm:items-end"
                        onSubmit={(e) => {
                          e.preventDefault();
                          joinCohort();
                        }}
                      >
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor="cohort-code-input">Cohort code</Label>
                          <input
                            id="cohort-code-input"
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="e.g. fall-2026-shift-a"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                        <Button type="submit" disabled={draft.trim() === ""}>
                          Join
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                          Joined cohort{" "}
                          <span className="font-mono font-medium text-foreground">
                            {joinedCode}
                          </span>
                          . New encounters count toward its aggregate.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => leaveCohort()}
                        >
                          Leave
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {joinedCode !== null && (
                  <CohortPanel analytics={cohortAnalytics} />
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
