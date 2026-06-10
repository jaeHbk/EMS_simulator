// FEEDBACK stage: renders encounter.scoreReport via ScoreCard. ScoreCard already
// surfaces triageDirection (UNDER_TRIAGE as a prominent safety warning) and missed
// red flags; here we add the LLM narrative and a start-over control.

import { Loader2, MessageSquareText, RotateCcw, Sparkles } from "lucide-react";

import { ScoreCard } from "../components/ScoreCard";
import { useEncounterStore } from "../store/encounterStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function Feedback(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const createEncounter = useEncounterStore((s) => s.createEncounter);
  const loading = useEncounterStore((s) => s.loading);

  if (!encounter) {
    return (
      <p className="stage__empty text-sm text-muted-foreground">
        No active encounter.
      </p>
    );
  }

  const report = encounter.scoreReport;

  return (
    <section
      className="stage stage--feedback space-y-6"
      aria-label="Feedback"
    >
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Debrief
          </span>
        </div>
        <h2 className="stage__title text-2xl font-semibold leading-none tracking-tight text-foreground">
          Feedback
        </h2>
        <p className="text-sm text-muted-foreground">
          How your triage compared with the expert reference.
        </p>
      </header>

      {report ? (
        <>
          <ScoreCard report={report} />
          {report.narrative && (
            <Card className="feedback__narrative" aria-label="Teaching feedback">
              <CardContent className="space-y-3 p-6">
                <div className="flex items-center gap-2">
                  <MessageSquareText
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="feedback__narrative-heading font-semibold leading-none tracking-tight">
                    Teaching feedback
                  </h3>
                </div>
                <p className="feedback__narrative-text text-sm leading-relaxed text-muted-foreground">
                  {report.narrative}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <p className="stage__empty text-sm">Scoring this encounter…</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          className="stage__advance"
          disabled={loading}
          onClick={() => {
            void createEncounter();
          }}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Start a new encounter
        </Button>
      </div>
    </section>
  );
}
