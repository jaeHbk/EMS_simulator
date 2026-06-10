// HISTORY stage: trainee chats with the LLM patient. Each question is posted via
// the store's postHistory action (the backend appends the trainee turn + the
// patient reply). Transcript is rendered from encounter.history. "Proceed to
// vitals" advances to VITALS.

import { ChatPanel } from "../components/ChatPanel";
import { useEncounterStore } from "../store/encounterStore";

export function History(): JSX.Element {
  const encounter = useEncounterStore((s) => s.encounter);
  const sendHistory = useEncounterStore((s) => s.sendHistory);
  const advance = useEncounterStore((s) => s.advance);
  const loading = useEncounterStore((s) => s.loading);

  if (!encounter) {
    return <p className="stage__empty">No active encounter.</p>;
  }

  return (
    <section className="stage stage--history" aria-label="History">
      <h2 className="stage__title">History taking</h2>
      <p className="stage__hint">
        Ask the patient questions to elicit the history of present illness, past
        history, medications, allergies, and any red flags.
      </p>
      <ChatPanel
        transcript={encounter.history}
        disabled={loading}
        onSend={(text) => {
          void sendHistory(text);
        }}
      />
      <button
        type="button"
        className="stage__advance"
        disabled={loading}
        onClick={() => {
          void advance("VITALS");
        }}
      >
        Proceed to vitals
      </button>
    </section>
  );
}
