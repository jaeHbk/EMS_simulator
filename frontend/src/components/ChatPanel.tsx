// Presentational chat panel for the HISTORY stage. Renders the trainee<->patient
// transcript and a composer. Pure / props-driven — the stage owns the store and
// passes transcript + an onSend callback. No network, no store access here.

import { useState } from "react";
import { MessagesSquare, Send, Stethoscope, User } from "lucide-react";
import type { HistoryTurn } from "../api/contract";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ChatPanelProps {
  transcript: HistoryTurn[];
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * The trainee's in-flight question, or null/undefined when none is pending.
   * When set, an optimistic trainee bubble (rendered in-flight, dimmed) plus a
   * "Patient is typing…" indicator are shown after the real transcript.
   */
  pending?: string | null;
}

export function ChatPanel({
  transcript,
  onSend,
  disabled = false,
  placeholder = "Ask the patient a question…",
  pending = null,
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
    <div className="chat-panel flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <ScrollArea className="h-[22rem]">
        <ol
          className="chat-panel__transcript flex flex-col gap-4 p-4"
          aria-label="History transcript"
        >
          {transcript.length === 0 && pending == null && (
            <li className="chat-panel__empty flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <MessagesSquare className="h-7 w-7 text-muted-foreground/70" aria-hidden="true" />
              No questions asked yet. Start taking the history.
            </li>
          )}
          {transcript.map((turn, i) => {
            const isTrainee = turn.role === "trainee";
            return (
              <li
                key={`${turn.role}-${i}`}
                className={cn(
                  "chat-panel__turn flex w-full gap-2.5",
                  `chat-panel__turn--${turn.role}`,
                  isTrainee ? "flex-row-reverse" : "flex-row",
                )}
                data-role={turn.role}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                    isTrainee
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {isTrainee ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Stethoscope className="h-4 w-4" />
                  )}
                </span>
                <div
                  className={cn(
                    "flex max-w-[78%] flex-col gap-1",
                    isTrainee ? "items-end" : "items-start",
                  )}
                >
                  <span
                    className={cn(
                      "chat-panel__role text-xs font-medium text-muted-foreground",
                      isTrainee ? "pr-1" : "pl-1",
                    )}
                  >
                    {isTrainee ? "You" : "Patient"}
                  </span>
                  <span
                    className={cn(
                      "chat-panel__text whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                      isTrainee
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tl-sm border border-border bg-muted text-foreground",
                    )}
                  >
                    {turn.text}
                  </span>
                </div>
              </li>
            );
          })}

          {pending != null && (
            <>
              {/* Optimistic echo of the trainee's just-sent question. Mirrors a
                  real trainee turn but dimmed to read as not-yet-confirmed. */}
              <li
                className="chat-panel__turn chat-panel__turn--trainee chat-panel__turn--pending flex w-full flex-row-reverse gap-2.5 opacity-60"
                data-role="trainee"
                data-pending="true"
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  <User className="h-4 w-4" />
                </span>
                <div className="flex max-w-[78%] flex-col items-end gap-1">
                  <span className="chat-panel__role pr-1 text-xs font-medium text-muted-foreground">
                    You
                  </span>
                  <span className="chat-panel__text whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground shadow-sm">
                    {pending}
                  </span>
                </div>
              </li>

              {/* "Patient is typing…" cue while the round-trip is in flight. */}
              <li
                className="chat-panel__turn chat-panel__turn--patient chat-panel__typing flex w-full flex-row gap-2.5"
                data-role="patient"
                data-typing="true"
                aria-live="polite"
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
                  aria-hidden="true"
                >
                  <Stethoscope className="h-4 w-4" />
                </span>
                <div className="flex max-w-[78%] flex-col items-start gap-1">
                  <span className="chat-panel__role pl-1 text-xs font-medium text-muted-foreground">
                    Patient
                  </span>
                  <span
                    className="chat-panel__typing-bubble flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-muted px-3.5 py-3 shadow-sm"
                    role="status"
                    aria-label="Patient is typing"
                  >
                    <span className="sr-only">Patient is typing…</span>
                    <span
                      className="chat-panel__dot h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]"
                      aria-hidden="true"
                    />
                    <span
                      className="chat-panel__dot h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]"
                      aria-hidden="true"
                    />
                    <span
                      className="chat-panel__dot h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </li>
            </>
          )}
        </ol>
      </ScrollArea>

      <form
        className="chat-panel__composer flex flex-col gap-2 border-t border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Label className="chat-panel__label" htmlFor="chat-panel-input">
          Question to patient
        </Label>
        <div className="flex items-end gap-2">
          <Textarea
            id="chat-panel-input"
            className="chat-panel__input min-h-[44px] flex-1 resize-none"
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
          <Button
            type="submit"
            className="chat-panel__send"
            disabled={disabled || draft.trim().length === 0}
          >
            <Send aria-hidden="true" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
