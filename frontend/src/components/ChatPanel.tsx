// Presentational chat panel for the HISTORY stage. Renders the trainee<->patient
// transcript and a composer. Pure / props-driven — the stage owns the store and
// passes transcript + an onSend callback. No network, no store access here.

import { useState } from "react";
import type { HistoryTurn } from "../api/contract";

export interface ChatPanelProps {
  transcript: HistoryTurn[];
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatPanel({
  transcript,
  onSend,
  disabled = false,
  placeholder = "Ask the patient a question…",
}: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState("");

  const submit = (): void => {
    const text = draft.trim();
    if (!text || disabled) {
      return;
    }
    onSend(text);
    setDraft("");
  };

  return (
    <div className="chat-panel">
      <ol className="chat-panel__transcript" aria-label="History transcript">
        {transcript.length === 0 && (
          <li className="chat-panel__empty">
            No questions asked yet. Start taking the history.
          </li>
        )}
        {transcript.map((turn, i) => (
          <li
            key={`${turn.role}-${i}`}
            className={`chat-panel__turn chat-panel__turn--${turn.role}`}
            data-role={turn.role}
          >
            <span className="chat-panel__role">
              {turn.role === "trainee" ? "You" : "Patient"}
            </span>
            <span className="chat-panel__text">{turn.text}</span>
          </li>
        ))}
      </ol>

      <form
        className="chat-panel__composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="chat-panel__label" htmlFor="chat-panel-input">
          Question to patient
        </label>
        <textarea
          id="chat-panel-input"
          className="chat-panel__input"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className="chat-panel__send"
          disabled={disabled || draft.trim().length === 0}
        >
          Send
        </button>
      </form>
    </div>
  );
}
