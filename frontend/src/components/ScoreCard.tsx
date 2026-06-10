// Presentational ScoreCard: renders a ScoreReport. Pure / props-driven — no store
// access. The headline is the ESI triageDirection; UNDER_TRIAGE is rendered as a
// prominent SAFETY WARNING because under-triage (assigning a less-acute / higher
// ESI number than the expert) is the dangerous error this trainer exists to reduce.

import type { ScoreReport, TriageDirection } from "../api/contract";

export interface ScoreCardProps {
  report: ScoreReport;
}

const DIRECTION_COPY: Record<
  TriageDirection,
  { heading: string; blurb: string; tone: "safe" | "caution" | "danger" }
> = {
  CORRECT: {
    heading: "Correct triage",
    blurb: "Your ESI level matched the expert reference.",
    tone: "safe",
  },
  OVER_TRIAGE: {
    heading: "Over-triage",
    blurb:
      "You assigned a more acute level than the expert. Safer than under-triage, but it can consume scarce resources.",
    tone: "caution",
  },
  UNDER_TRIAGE: {
    heading: "Under-triage — safety warning",
    blurb:
      "You assigned a LESS acute level than the expert. Under-triage can delay life-saving care and is the most dangerous triage error.",
    tone: "danger",
  },
};

export function ScoreCard({ report }: ScoreCardProps): JSX.Element {
  const { esi, dimensions, overallPercent, missedRedFlags } = report;
  const direction = DIRECTION_COPY[esi.triageDirection];
  const isUnderTriage = esi.triageDirection === "UNDER_TRIAGE";

  return (
    <section className="score-card" aria-label="Score report">
      <header
        className={`score-card__direction score-card__direction--${direction.tone}`}
        // The under-triage banner is an assertive alert so it is announced first.
        role={isUnderTriage ? "alert" : "status"}
        data-direction={esi.triageDirection}
      >
        {isUnderTriage && (
          <span className="score-card__warning-badge" aria-hidden="true">
            ⚠ UNDER-TRIAGE
          </span>
        )}
        <h2 className="score-card__heading">{direction.heading}</h2>
        <p className="score-card__blurb">{direction.blurb}</p>
        <p className="score-card__esi">
          You assigned <strong>ESI {esi.assigned}</strong> · expert reference{" "}
          <strong>ESI {esi.expert}</strong>
          {esi.levelsOff !== 0 && (
            <span className="score-card__levels-off">
              {" "}
              ({Math.abs(esi.levelsOff)} level
              {Math.abs(esi.levelsOff) === 1 ? "" : "s"}{" "}
              {esi.levelsOff > 0 ? "less acute" : "more acute"})
            </span>
          )}
        </p>
      </header>

      <div className="score-card__overall">
        <span className="score-card__overall-label">Overall</span>
        <span className="score-card__overall-value">
          {Math.round(overallPercent)}%
        </span>
      </div>

      <ul className="score-card__dimensions">
        {dimensions.map((dim) => (
          <li key={dim.key} className="score-card__dimension">
            <div className="score-card__dimension-head">
              <span className="score-card__dimension-label">{dim.label}</span>
              <span className="score-card__dimension-score">
                {Math.round(dim.score * 100)}%
                {dim.weight === 0 && (
                  <span className="score-card__dimension-na"> (n/a)</span>
                )}
              </span>
            </div>
            <div
              className="score-card__bar"
              role="progressbar"
              aria-valuenow={Math.round(dim.score * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={dim.label}
            >
              <div
                className="score-card__bar-fill"
                style={{ width: `${Math.round(dim.score * 100)}%` }}
              />
            </div>
            {dim.detail && (
              <p className="score-card__dimension-detail">{dim.detail}</p>
            )}
          </li>
        ))}
      </ul>

      {missedRedFlags.length > 0 && (
        <div className="score-card__red-flags" aria-label="Missed red flags">
          <h3 className="score-card__red-flags-heading">Missed red flags</h3>
          <ul className="score-card__red-flags-list">
            {missedRedFlags.map((flag, i) => (
              <li key={`${flag}-${i}`} className="score-card__red-flag">
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
