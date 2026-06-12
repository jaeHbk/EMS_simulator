"""Deterministic per-trainee learning-curve analytics.

Pure, rule-based aggregation over a trainee's stored encounters — no LLM, no
randomness, no I/O. Given the encounters already loaded for a trainee, it counts
triage directions, computes rates, and builds a chronological history of points.

Only encounters at stage FEEDBACK with a populated ``scoreReport`` contribute:
those are the completed, scored encounters whose ESI result is final. Anything
in progress (no score yet) is ignored. An unknown trainee (no qualifying
encounters) yields a zeroed :class:`TraineeAnalytics` — never an error.

The ``traineeId`` is an OPAQUE per-browser analytics key, not an identity or
credential.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.models import Encounter, Stage
from app.models.analytics import AnalyticsPoint, TraineeAnalytics
from app.models.score import ScoreReport, TriageDirection

__all__ = ["compute_analytics"]


def _zeroed(trainee_id: str) -> TraineeAnalytics:
    return TraineeAnalytics(
        traineeId=trainee_id,
        totalEncounters=0,
        underTriageRate=0.0,
        overTriageRate=0.0,
        correctRate=0.0,
        meanLevelsOffAbs=0.0,
        history=[],
    )


def compute_analytics(
    trainee_id: str, encounters: Iterable[Encounter]
) -> TraineeAnalytics:
    """Aggregate a trainee's scored encounters into learning-curve metrics.

    ``encounters`` is expected to already be the trainee's encounters in
    chronological order (oldest first); the store returns them sorted by
    ``startedAt``. Encounters not at FEEDBACK, or lacking a ``scoreReport``, are
    skipped. Rates are ``count / total`` and default to ``0.0`` when there are no
    scored encounters; ``meanLevelsOffAbs`` is the mean of ``abs(levelsOff)``.
    """
    # Pair each qualifying encounter with its (now provably non-null) report so
    # mypy can narrow ScoreReport without an assert downstream.
    scored: list[tuple[Encounter, ScoreReport]] = [
        (enc, enc.scoreReport)
        for enc in encounters
        if enc.stage is Stage.FEEDBACK and enc.scoreReport is not None
    ]

    if not scored:
        return _zeroed(trainee_id)

    history: list[AnalyticsPoint] = []
    under = over = correct = 0
    levels_off_abs_sum = 0

    for enc, report in scored:
        esi = report.esi

        direction = esi.triageDirection
        if direction is TriageDirection.UNDER_TRIAGE:
            under += 1
        elif direction is TriageDirection.OVER_TRIAGE:
            over += 1
        else:
            correct += 1

        levels_off_abs_sum += abs(esi.levelsOff)

        history.append(
            AnalyticsPoint(
                encounterId=enc.encounterId,
                startedAt=enc.startedAt,
                triageDirection=direction,
                esiAssigned=enc.esiAssigned,
                esiExpert=esi.expert,
                overallPercent=report.overallPercent,
            )
        )

    total = len(scored)
    return TraineeAnalytics(
        traineeId=trainee_id,
        totalEncounters=total,
        underTriageRate=under / total,
        overTriageRate=over / total,
        correctRate=correct / total,
        meanLevelsOffAbs=levels_off_abs_sum / total,
        history=history,
    )
