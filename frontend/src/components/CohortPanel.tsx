// Presentational "Cohort overview" panel: the instructor-mode aggregate for a
// cohort, rendered from CohortAnalytics. Pure / props-driven — no store access
// (App passes the prop).
//
// The headline figure is the cohort UNDER-TRIAGE rate, rendered in destructive
// (red), because under-triage (assigning a LESS acute level than the expert) is
// the dangerous error this trainer exists to reduce. The per-trainee table is
// sorted struggling-first (backend orders by underTriageRate desc), so an
// instructor sees who needs attention at a glance.
//
// Accessibility: every color cue is paired with text (a "(under)" tag / heading
// + aria-label), so the panel is legible without color (never color alone).

import { Users } from "lucide-react";

import type { CohortAnalytics, CohortTraineeRow } from "../api/contract";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export interface CohortPanelProps {
  analytics: CohortAnalytics | null;
}

/** Render a 0..1 rate as a whole-number percentage. */
function pct(rate: number): number {
  return Math.round(rate * 100);
}

/**
 * Shorten an opaque trainee id for the table so the column stays readable while
 * keeping enough of the suffix to tell learners apart. The sentinel
 * "(anonymous)" passes through untouched.
 */
function shortId(traineeId: string): string {
  if (traineeId === "(anonymous)") return traineeId;
  return traineeId.length > 12 ? `${traineeId.slice(0, 12)}…` : traineeId;
}

export function CohortPanel({ analytics }: CohortPanelProps): JSX.Element {
  // Empty state: no cohort analytics yet, or a cohort with no scored encounters.
  if (!analytics || analytics.totalEncounters === 0) {
    return (
      <Card className="cohort-panel" aria-label="Cohort overview">
        <CardContent className="space-y-4 p-6">
          <Heading />
          <p className="cohort-panel__empty text-sm text-muted-foreground">
            No cohort data yet — encounters joined to this cohort will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    totalTrainees,
    totalEncounters,
    underTriageRate,
    correctRate,
    byDifficulty,
    trainees,
  } = analytics;

  return (
    <Card className="cohort-panel" aria-label="Cohort overview">
      <CardContent className="space-y-5 p-6">
        <Heading />

        {/* Stat tiles. Cohort under-triage is the headline (destructive/red). */}
        <dl className="cohort-panel__stats grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Under-triage"
            value={`${pct(underTriageRate)}%`}
            valueClass="text-destructive"
            className="cohort-panel__under-triage"
          />
          <Stat
            label="Trainees"
            value={String(totalTrainees)}
            valueClass="text-foreground"
          />
          <Stat
            label="Encounters"
            value={String(totalEncounters)}
            valueClass="text-foreground"
          />
          <Stat
            label="Correct"
            value={`${pct(correctRate)}%`}
            valueClass="text-success"
          />
        </dl>

        {/* Optional trap-vs-standard under-triage split. */}
        {byDifficulty && (
          <div className="cohort-panel__difficulty space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Under-triage by difficulty
            </p>
            <dl className="grid grid-cols-2 gap-3">
              <Stat
                label="Trap cases"
                value={`${pct(byDifficulty.trap.underTriageRate)}%`}
                valueClass="text-destructive"
                className="cohort-panel__trap"
              />
              <Stat
                label="Standard cases"
                value={`${pct(byDifficulty.standard.underTriageRate)}%`}
                valueClass="text-destructive"
                className="cohort-panel__standard"
              />
            </dl>
          </div>
        )}

        {/* Per-trainee breakdown, struggling-first (rendered in array order). */}
        <div className="cohort-panel__trainees space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Per-trainee breakdown
          </p>
          <table className="cohort-panel__table w-full text-sm">
            <caption className="sr-only">
              Per-trainee triage performance, struggling trainees first.
            </caption>
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Trainee
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Under-triage
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Correct
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Encounters
                </th>
              </tr>
            </thead>
            <tbody>
              {trainees.map((row) => (
                <TraineeRow key={row.traineeId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Heading(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-primary" aria-hidden="true" />
      <h2 className="cohort-panel__heading font-semibold leading-none tracking-tight">
        Cohort overview
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
    <div className={cn("cohort-panel__stat rounded-lg border bg-card p-3", className)}>
      <dd className={cn("text-2xl font-bold tabular-nums leading-none", valueClass)}>
        {value}
      </dd>
      <dt className="mt-1 text-xs font-medium text-muted-foreground">{label}</dt>
    </div>
  );
}

function TraineeRow({ row }: { row: CohortTraineeRow }): JSX.Element {
  return (
    <tr
      className="cohort-panel__row border-t border-border"
      data-trainee-id={row.traineeId}
    >
      <td className="py-1.5 pr-3 font-mono text-xs" title={row.traineeId}>
        {shortId(row.traineeId)}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums">
        {/* Under-triage uses destructive color PAIRED with a text "(under)" cue
            and an aria-label, so it reads without relying on color alone. */}
        <span
          className="cohort-panel__row-under font-semibold text-destructive"
          aria-label={`Under-triage ${pct(row.underTriageRate)} percent`}
        >
          {pct(row.underTriageRate)}%
          <span className="ml-1 text-[0.65rem] font-normal uppercase tracking-wide text-destructive">
            under
          </span>
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-success">
        {pct(row.correctRate)}%
      </td>
      <td className="py-1.5 text-right tabular-nums text-foreground">
        {row.totalEncounters}
      </td>
    </tr>
  );
}
