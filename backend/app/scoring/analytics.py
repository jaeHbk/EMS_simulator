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
from app.models.analytics import (
    AnalyticsPoint,
    ByDifficulty,
    DifficultyStats,
    TraineeAnalytics,
)
from app.models.score import ScoreReport, TriageDirection

__all__ = ["compute_analytics"]

# The TRAP difficulty tag (mirrors models.triage_case.Difficulty.TRAP). Any other
# value — STANDARD or None/absent — buckets as "standard".
_TRAP = "TRAP"


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
    trainee_id: str,
    encounters: Iterable[Encounter],
    difficulty_by_case: dict[str, str | None] | None = None,
) -> TraineeAnalytics:
    """Aggregate a trainee's scored encounters into learning-curve metrics.

    ``encounters`` is expected to already be the trainee's encounters in
    chronological order (oldest first); the store returns them sorted by
    ``startedAt``. Encounters not at FEEDBACK, or lacking a ``scoreReport``, are
    skipped. Rates are ``count / total`` and default to ``0.0`` when there are no
    scored encounters; ``meanLevelsOffAbs`` is the mean of ``abs(levelsOff)``.

    ``difficulty_by_case`` maps ``caseId -> difficulty`` (``"TRAP"``, ``"STANDARD"``
    or ``None``). When provided, the scored encounters are also segmented into a
    ``byDifficulty`` summary: an encounter whose case maps to ``"TRAP"`` lands in
    the trap bucket, and anything else (``"STANDARD"`` or ``None`` — None is
    treated as standard) lands in the standard bucket. ``byDifficulty`` is only
    populated when the map is provided AND there is at least one scored encounter;
    otherwise it stays ``None``, keeping the legacy/zeroed path unchanged. This
    function remains pure — the caller resolves difficulty and passes the map in.
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
    # Per-difficulty tallies: (total, under) for the trap and standard buckets.
    trap_total = trap_under = 0
    standard_total = standard_under = 0

    for enc, report in scored:
        esi = report.esi

        direction = esi.triageDirection
        is_under = direction is TriageDirection.UNDER_TRIAGE
        if is_under:
            under += 1
        elif direction is TriageDirection.OVER_TRIAGE:
            over += 1
        else:
            correct += 1

        levels_off_abs_sum += abs(esi.levelsOff)

        if difficulty_by_case is not None:
            # None/absent or "STANDARD" -> standard; only an explicit "TRAP" traps.
            if difficulty_by_case.get(enc.caseId) == _TRAP:
                trap_total += 1
                trap_under += int(is_under)
            else:
                standard_total += 1
                standard_under += int(is_under)

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

    by_difficulty: ByDifficulty | None = None
    if difficulty_by_case is not None:
        by_difficulty = ByDifficulty(
            trap=DifficultyStats(
                totalEncounters=trap_total,
                underTriageRate=(trap_under / trap_total) if trap_total else 0.0,
            ),
            standard=DifficultyStats(
                totalEncounters=standard_total,
                underTriageRate=(
                    standard_under / standard_total if standard_total else 0.0
                ),
            ),
        )

    return TraineeAnalytics(
        traineeId=trainee_id,
        totalEncounters=total,
        underTriageRate=under / total,
        overTriageRate=over / total,
        correctRate=correct / total,
        meanLevelsOffAbs=levels_off_abs_sum / total,
        byDifficulty=by_difficulty,
        history=history,
    )
