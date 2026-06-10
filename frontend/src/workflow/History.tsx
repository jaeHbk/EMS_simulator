// HISTORY stage: trainee chats with the LLM patient. Each question is posted via
// the store's postHistory action (the backend appends the trainee turn + the
// patient reply). Transcript is rendered from encounter.history. "Proceed to
// vitals" advances to VITALS.

import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { ChatPanel } from "../components/ChatPanel";
import { useEncounterStore } from "../store/encounterStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function History(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const sendHistory = useEncounterStore((s) => s.sendHistory);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  if (!encounter) {
    return (
      <p className="stage__empty text-sm text-muted-foreground">No active encounter.</p>
    );
  }

  return (
    <section className="stage stage--history" aria-label="History">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <MessageCircleQuestion className="h-5 w-5" />
            </span>
            <div className="space-y-1.5">
              <h2 className="stage__title text-lg font-semibold leading-none tracking-tight">
                History taking
              </h2>
              <p className="stage__hint text-sm text-muted-foreground">
                Ask the patient questions to elicit the history of present illness, past
                history, medications, allergies, and any red flags.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChatPanel
            transcript={encounter.history}
            disabled={loading}
            onSend={(text) => {
              void sendHistory(text);
            }}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              className="stage__advance"
              disabled={loading}
              onClick={() => {
                void advance("VITALS");
              }}
            >
              Proceed to vitals
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
