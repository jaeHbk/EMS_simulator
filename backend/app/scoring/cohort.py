"""Deterministic cohort-level triage analytics.

Pure, rule-based aggregation over a cohort's stored encounters — no LLM, no
randomness, no I/O. Mirrors the per-trainee aggregator in
``app/scoring/analytics.py``: only encounters at stage FEEDBACK with a populated
``scoreReport`` contribute, it counts triage directions into rates, and (when a
difficulty map is supplied) it segments under-triage into trap vs standard
buckets. On top of the per-trainee path it also rolls the cohort up into a
per-trainee breakdown so an instructor can spot who is struggling.

An unknown/empty cohort (no qualifying encounters) yields a zeroed
:class:`CohortAnalytics` — never an error.

The ``cohortId`` and per-trainee ids are OPAQUE grouping/analytics keys, not
identities or credentials. Aggregates and opaque codes only: this never emits PII
or per-encounter content beyond counts/rates.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.models import Encounter, Stage
from app.models.analytics import ByDifficulty, DifficultyStats
from app.models.cohort import CohortAnalytics, CohortTraineeRow
from app.models.score import ScoreReport, TriageDirection

__all__ = ["compute_cohort_analytics"]

# The TRAP difficulty tag (mirrors models.triage_case.Difficulty.TRAP). Any other
# value — STANDARD or None/absent — buckets as "standard". Matches analytics.py.
_TRAP = "TRAP"

# Encounters with no traineeId are grouped under this sentinel so they still form
# one trainee row (and count as one distinct trainee) in the cohort breakdown.
_ANONYMOUS = "(anonymous)"


def _zeroed(cohort_id: str) -> CohortAnalytics:
    return CohortAnalytics(
        cohortId=cohort_id,
        totalTrainees=0,
        totalEncounters=0,
        underTriageRate=0.0,
        overTriageRate=0.0,
        correctRate=0.0,
        meanLevelsOffAbs=0.0,
        byDifficulty=None,
        trainees=[],
    )


class _Tally:
    """Mutable direction/levels-off counter for one trainee (and the cohort)."""

    def __init__(self) -> None:
        self.total = 0
        self.under = 0
        self.over = 0
        self.correct = 0
        self.levels_off_abs_sum = 0

    def add(self, direction: TriageDirection, levels_off: int) -> None:
        self.total += 1
        if direction is TriageDirection.UNDER_TRIAGE:
            self.under += 1
        elif direction is TriageDirection.OVER_TRIAGE:
            self.over += 1
        else:
            self.correct += 1
        self.levels_off_abs_sum += abs(levels_off)

    def rate(self, count: int) -> float:
        return count / self.total if self.total else 0.0


def compute_cohort_analytics(
    cohort_id: str,
    encounters: Iterable[Encounter],
    difficulty_by_case: dict[str, str | None] | None = None,
) -> CohortAnalytics:
    """Aggregate a cohort's scored encounters into instructor-facing metrics.

    Only encounters at FEEDBACK with a populated ``scoreReport`` are considered.
    Cohort-wide rates are ``count / total`` (``0.0`` when there are no scored
    encounters); ``meanLevelsOffAbs`` is the mean of ``abs(levelsOff)``.

    ``totalEncounters`` is the scored-encounter count. ``totalTrainees`` is the
    number of distinct ``traineeId`` among the scored encounters; encounters whose
    ``traineeId`` is ``None`` are grouped under the sentinel ``"(anonymous)"`` so
    they still form a single trainee row and count as one trainee.

    ``difficulty_by_case`` maps ``caseId -> difficulty`` (``"TRAP"``, ``"STANDARD"``
    or ``None``). When provided AND there is at least one scored encounter, the
    cohort's under-triage is also segmented into a ``byDifficulty`` summary (an
    encounter whose case maps to ``"TRAP"`` lands in the trap bucket, anything else
    — ``"STANDARD"`` or ``None`` — lands in standard). Otherwise ``byDifficulty``
    stays ``None``. This function is pure — the caller resolves difficulty and
    passes the map in.

    ``trainees`` is one :class:`CohortTraineeRow` per distinct trainee (or
    ``"(anonymous)"``), each with that trainee's scored-encounter count plus
    under-triage and correct rates, sorted by ``underTriageRate`` descending and
    tie-broken by ``traineeId`` ascending (struggling trainees first; deterministic).
    """
    # Pair each qualifying encounter with its (now provably non-null) report so
    # mypy can narrow ScoreReport without an assert downstream.
    scored: list[tuple[Encounter, ScoreReport]] = [
        (enc, enc.scoreReport)
        for enc in encounters
        if enc.stage is Stage.FEEDBACK and enc.scoreReport is not None
    ]

    if not scored:
        return _zeroed(cohort_id)

    cohort = _Tally()
    # Per-trainee tallies, keyed by the opaque trainee id (or the sentinel).
    by_trainee: dict[str, _Tally] = {}
    # Per-difficulty tallies: (total, under) for the trap and standard buckets.
    trap_total = trap_under = 0
    standard_total = standard_under = 0

    for enc, report in scored:
        esi = report.esi
        direction = esi.triageDirection
        is_under = direction is TriageDirection.UNDER_TRIAGE

        cohort.add(direction, esi.levelsOff)

        key = enc.traineeId if enc.traineeId is not None else _ANONYMOUS
        by_trainee.setdefault(key, _Tally()).add(direction, esi.levelsOff)

        if difficulty_by_case is not None:
            # None/absent or "STANDARD" -> standard; only an explicit "TRAP" traps.
            if difficulty_by_case.get(enc.caseId) == _TRAP:
                trap_total += 1
                trap_under += int(is_under)
            else:
                standard_total += 1
                standard_under += int(is_under)

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

    # One row per distinct trainee, sorted struggling-first: underTriageRate desc,
    # then traineeId asc for a stable, deterministic tie-break.
    trainees = sorted(
        (
            CohortTraineeRow(
                traineeId=tid,
                totalEncounters=tally.total,
                underTriageRate=tally.rate(tally.under),
                correctRate=tally.rate(tally.correct),
            )
            for tid, tally in by_trainee.items()
        ),
        key=lambda row: (-row.underTriageRate, row.traineeId),
    )

    return CohortAnalytics(
        cohortId=cohort_id,
        totalTrainees=len(by_trainee),
        totalEncounters=cohort.total,
        underTriageRate=cohort.rate(cohort.under),
        overTriageRate=cohort.rate(cohort.over),
        correctRate=cohort.rate(cohort.correct),
        meanLevelsOffAbs=cohort.levels_off_abs_sum / cohort.total,
        byDifficulty=by_difficulty,
        trainees=trainees,
    )
