// Presentational "Your progress" panel: renders a trainee's learning curve from
// TraineeAnalytics. Pure / props-driven — no store access (App passes the prop).
//
// The headline figure is the UNDER-TRIAGE rate, rendered in destructive (red),
// because under-triage (assigning a LESS acute level than the expert) is the
// dangerous error this trainer exists to reduce. Watching it fall with practice
// is the demo's evidence the tool works.
//
// Accessibility: every color cue is paired with a letter + aria-label, so the
// chronological strip is legible without color (never color alone).

import { TrendingDown } from "lucide-react";

import type { AnalyticsPoint, TraineeAnalytics, TriageDirection } from "../api/contract";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export interface ProgressPanelProps {
  analytics: TraineeAnalytics | null;
}

// Per-direction chip presentation. Clinical semantics: under-triage = destructive
// (red), over-triage = warning (amber), correct = success (green). Each chip
// carries a single-letter glyph and an aria-label so the meaning survives without
// color (a11y) — never color alone.
const DIRECTION_CHIP: Record<
  TriageDirection,
  { letter: string; label: string; classes: string }
> = {
  CORRECT: {
    letter: "C",
    label: "Correct",
    classes: "bg-success text-success-foreground",
  },
  OVER_TRIAGE: {
    letter: "O",
    label: "Over-triage",
    classes: "bg-warning text-warning-foreground",
  },
  UNDER_TRIAGE: {
    letter: "U",
    label: "Under-triage",
    classes: "bg-destructive text-destructive-foreground",
  },
};

/** Render a 0..1 rate as a whole-number percentage. */
function pct(rate: number): number {
  return Math.round(rate * 100);
}

export function ProgressPanel({ analytics }: ProgressPanelProps): JSX.Element {
  // Empty state: no analytics yet, or a trainee with no scored encounters.
  if (!analytics || analytics.totalEncounters === 0) {
    return (
      <Card className="progress-panel" aria-label="Your progress">
        <CardContent className="space-y-4 p-6">
          <Heading />
          <p className="progress-panel__empty text-sm text-muted-foreground">
            Complete an encounter to see your progress.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { totalEncounters, underTriageRate, correctRate, history } = analytics;

  return (
    <Card className="progress-panel" aria-label="Your progress">
      <CardContent className="space-y-5 p-6">
        <Heading />

        {/* Stat tiles. Under-triage is the headline (destructive/red). */}
        <dl className="progress-panel__stats grid grid-cols-3 gap-3">
          <Stat
            label="Encounters"
            value={String(totalEncounters)}
            valueClass="text-foreground"
          />
          <Stat
            label="Under-triage"
            value={`${pct(underTriageRate)}%`}
            valueClass="text-destructive"
            className="progress-panel__under-triage"
          />
          <Stat
            label="Correct"
            value={`${pct(correctRate)}%`}
            valueClass="text-success"
          />
        </dl>

        {/* Chronological strip: one chip per scored encounter, oldest → newest. */}
        <div className="progress-panel__history space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent encounters
          </p>
          <ol className="progress-panel__strip flex flex-wrap gap-1.5">
            {history.map((point, i) => (
              <Chip key={`${point.encounterId}-${i}`} point={point} />
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function Heading(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <TrendingDown className="h-4 w-4 text-primary" aria-hidden="true" />
      <h2 className="progress-panel__heading font-semibold leading-none tracking-tight">
        Your progress
      </h2>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  className,
}: {
  label: string;
  value: string;
  valueClass: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn("progress-panel__stat rounded-lg border bg-card p-3", className)}>
      <dd className={cn("text-2xl font-bold tabular-nums leading-none", valueClass)}>
        {value}
      </dd>
      <dt className="mt-1 text-xs font-medium text-muted-foreground">{label}</dt>
    </div>
  );
}

function Chip({ point }: { point: AnalyticsPoint }): JSX.Element {
  const chip = DIRECTION_CHIP[point.triageDirection];
  return (
    <li>
      <span
        className={cn(
          "progress-panel__chip flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
          chip.classes,
        )}
        data-direction={point.triageDirection}
        title={chip.label}
        aria-label={chip.label}
        role="img"
      >
        {/* Single-letter glyph: a non-color cue so the chip reads without color. */}
        <span aria-hidden="true">{chip.letter}</span>
      </span>
    </li>
  );
}
