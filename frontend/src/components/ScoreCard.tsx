// Presentational ScoreCard: renders a ScoreReport. Pure / props-driven — no store
// access. The headline is the ESI triageDirection; UNDER_TRIAGE is rendered as a
// prominent SAFETY WARNING because under-triage (assigning a less-acute / higher
// ESI number than the expert) is the dangerous error this trainer exists to reduce.

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Flag,
  Target,
} from "lucide-react";

import type { ScoreReport, TriageDirection } from "../api/contract";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

export interface ScoreCardProps {
  report: ScoreReport;
}

const DIRECTION_COPY: Record<
  TriageDirection,
  { heading: string; badge: string; blurb: string; tone: "safe" | "caution" | "danger" }
> = {
  CORRECT: {
    heading: "Correct triage",
    // Short hero-badge label. Kept DISTINCT from `heading` so the heading phrase
    // appears exactly once in the DOM (tests use getByText on the heading).
    badge: "Match",
    blurb: "Your ESI level matched the expert reference.",
    tone: "safe",
  },
  OVER_TRIAGE: {
    heading: "Over-triage",
    badge: "Over",
    blurb:
      "You assigned a more acute level than the expert. Safer than under-triage, but it can consume scarce resources.",
    tone: "caution",
  },
  UNDER_TRIAGE: {
    heading: "Under-triage — safety warning",
    badge: "Under",
    blurb:
      "You assigned a LESS acute level than the expert. Under-triage can delay life-saving care and is the most dangerous triage error.",
    tone: "danger",
  },
};

// Per-tone presentation: which Alert variant, icon, and accent the direction banner
// uses. Clinical semantics — danger = destructive (red), caution = warning (amber),
// safe = success (green). Color always pairs with an icon + text, never alone.
const TONE_PRESENTATION: Record<
  "safe" | "caution" | "danger",
  {
    variant: "destructive" | "warning" | "success";
    Icon: typeof CheckCircle2;
    iconClass: string;
  }
> = {
  safe: { variant: "success", Icon: CheckCircle2, iconClass: "text-success" },
  caution: { variant: "warning", Icon: ArrowUpRight, iconClass: "text-warning" },
  danger: { variant: "destructive", Icon: AlertTriangle, iconClass: "text-destructive" },
};

// Translate the 0..100 overall score into a tone for the hero ring/number so the
// headline figure reads as good/borderline/poor at a glance (paired with the %).
function overallTone(percent: number): {
  ring: string;
  text: string;
  label: string;
} {
  if (percent >= 80) {
    return { ring: "text-success", text: "text-success", label: "Strong" };
  }
  if (percent >= 60) {
    return { ring: "text-warning", text: "text-warning", label: "Developing" };
  }
  return { ring: "text-destructive", text: "text-destructive", label: "Needs work" };
}

// Per-dimension bar tone, also paired with the numeric %.
function dimensionIndicator(score: number): string {
  if (score >= 0.8) return "bg-success";
  if (score >= 0.5) return "bg-warning";
  return "bg-destructive";
}

export function ScoreCard({ report }: ScoreCardProps): JSX.Element {
  const { esi, dimensions, overallPercent, missedRedFlags } = report;
  const direction = DIRECTION_COPY[esi.triageDirection];
  const isUnderTriage = esi.triageDirection === "UNDER_TRIAGE";
  const present = TONE_PRESENTATION[direction.tone];
  const pct = Math.round(overallPercent);
  const tone = overallTone(pct);

  // Geometry for the radial overall-score hero.
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <section className="score-card space-y-6" aria-label="Score report">
      {/* Overall-score hero: a large radial figure paired with the headline %. */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
            <svg
              className="h-full w-full -rotate-90"
              viewBox="0 0 120 120"
              aria-hidden="true"
            >
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                strokeWidth="10"
                className="stroke-muted"
              />
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className={cn("transition-all", tone.ring)}
                stroke="currentColor"
                strokeDasharray={`${dash} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-4xl font-bold tabular-nums leading-none", tone.text)}>
                {pct}%
              </span>
              <span className="mt-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                Overall
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Encounter score
            </span>
            <div className="flex items-center gap-2">
              <span className={cn("text-2xl font-semibold", tone.text)}>{tone.label}</span>
              <Badge
                variant={
                  direction.tone === "safe"
                    ? "success"
                    : direction.tone === "caution"
                      ? "warning"
                      : "destructive"
                }
              >
                {direction.badge}
              </Badge>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              Weighted across {dimensions.length} scoring{" "}
              {dimensions.length === 1 ? "dimension" : "dimensions"}, anchored to the
              expert ESI reference.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Triage-direction banner. UNDER_TRIAGE is an assertive alert (role="alert")
          announced first; the others are role="status". The element carries all the
          direction copy so the safety wording stays inside the announced region. */}
      <Alert
        variant={present.variant}
        // The under-triage banner is an assertive alert so it is announced first.
        role={isUnderTriage ? "alert" : "status"}
        data-direction={esi.triageDirection}
        className="score-card__direction"
      >
        <present.Icon className="h-4 w-4" aria-hidden="true" />
        {isUnderTriage && (
          <Badge
            variant="destructive"
            className="score-card__warning-badge mb-2 gap-1"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            UNDER-TRIAGE
          </Badge>
        )}
        <AlertTitle className="score-card__heading text-base">
          {direction.heading}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p className="score-card__blurb">{direction.blurb}</p>
          <p className="score-card__esi text-sm">
            You assigned <strong className="font-semibold">ESI {esi.assigned}</strong>{" "}
            · expert reference{" "}
            <strong className="font-semibold">ESI {esi.expert}</strong>
            {esi.levelsOff !== 0 && (
              <span className="score-card__levels-off text-muted-foreground">
                {" "}
                ({Math.abs(esi.levelsOff)} level
                {Math.abs(esi.levelsOff) === 1 ? "" : "s"}{" "}
                {esi.levelsOff > 0 ? "less acute" : "more acute"})
              </span>
            )}
          </p>
        </AlertDescription>
      </Alert>

      {/* Per-dimension breakdown as labelled progress bars. */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold leading-none tracking-tight">
              Performance breakdown
            </h3>
          </div>
          <Separator />
          <ul className="score-card__dimensions space-y-4">
            {dimensions.map((dim) => {
              const dimPct = Math.round(dim.score * 100);
              return (
                <li key={dim.key} className="score-card__dimension space-y-1.5">
                  <div className="score-card__dimension-head flex items-baseline justify-between gap-3">
                    <span className="score-card__dimension-label text-sm font-medium">
                      {dim.label}
                    </span>
                    <span className="score-card__dimension-score text-sm font-semibold tabular-nums">
                      {dimPct}%
                      {dim.weight === 0 && (
                        <span className="score-card__dimension-na font-normal text-muted-foreground">
                          {" "}
                          (n/a)
                        </span>
                      )}
                    </span>
                  </div>
                  <Progress
                    value={dimPct}
                    className="score-card__bar h-2"
                    indicatorClassName={cn(
                      "score-card__bar-fill",
                      dimensionIndicator(dim.score),
                    )}
                    aria-label={dim.label}
                  />
                  {dim.detail && (
                    <p className="score-card__dimension-detail text-xs text-muted-foreground">
                      {dim.detail}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Missed red flags — clinically important misses, shown as warning chips. */}
      {missedRedFlags.length > 0 && (
        <Card
          className="score-card__red-flags border-warning/40 bg-warning/5"
          aria-label="Missed red flags"
        >
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-warning" aria-hidden="true" />
              <h3 className="score-card__red-flags-heading font-semibold leading-none tracking-tight">
                Missed red flags
              </h3>
            </div>
            <ul className="score-card__red-flags-list flex flex-wrap gap-2">
              {missedRedFlags.map((flag, i) => (
                <li key={`${flag}-${i}`} className="score-card__red-flag">
                  <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {flag}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
