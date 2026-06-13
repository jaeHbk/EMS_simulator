"""Unit tests for the pure ``compute_cohort_analytics`` aggregation.

These exercise the deterministic core directly with hand-built encounters and an
explicit ``difficulty_by_case`` map — no I/O, no routes, no store. The route's job
(resolving difficulty via ``data.get_case`` and loading by cohort) is covered in
test_api.py; here we pin the cohort math and the per-trainee breakdown.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import Encounter, Stage
from app.models.score import EsiResult, ScoreReport, TriageDirection
from app.scoring.cohort import compute_cohort_analytics


def _scored_encounter(
    *,
    encounter_id: str,
    case_id: str,
    assigned: int,
    expert: int,
    direction: TriageDirection,
    started_at: datetime,
    trainee_id: str | None,
    cohort_id: str | None = "cohort-1",
) -> Encounter:
    """A FEEDBACK-stage encounter carrying a minimal but valid ScoreReport."""
    return Encounter(
        encounterId=encounter_id,
        caseId=case_id,
        stage=Stage.FEEDBACK,
        esiAssigned=assigned,
        startedAt=started_at,
        traineeId=trainee_id,
        cohortId=cohort_id,
        scoreReport=ScoreReport(
            encounterId=encounter_id,
            esi=EsiResult(
                assigned=assigned,
                expert=expert,
                correct=direction is TriageDirection.CORRECT,
                triageDirection=direction,
                levelsOff=assigned - expert,
            ),
            dimensions=[],
            overallPercent=50.0,
            narrative="",
        ),
    )


def test_compute_cohort_analytics_aggregates_two_trainees() -> None:
    """Trainee A: one UNDER_TRIAGE. Trainee B: one CORRECT + one OVER_TRIAGE.

    Cohort-wide that's 3 scored encounters across 2 trainees with one of each
    direction, and the per-trainee rows are sorted struggling-first.
    """
    t0 = datetime(2026, 6, 9, tzinfo=UTC)
    t1 = datetime(2026, 6, 9, 0, 5, tzinfo=UTC)
    t2 = datetime(2026, 6, 9, 0, 10, tzinfo=UTC)

    a_under = _scored_encounter(
        encounter_id="enc-a1",
        case_id="synthetic:trap-001",
        assigned=4,
        expert=3,
        direction=TriageDirection.UNDER_TRIAGE,
        started_at=t0,
        trainee_id="trainee-a",
    )
    b_correct = _scored_encounter(
        encounter_id="enc-b1",
        case_id="synthetic:standard-001",
        assigned=3,
        expert=3,
        direction=TriageDirection.CORRECT,
        started_at=t1,
        trainee_id="trainee-b",
    )
    b_over = _scored_encounter(
        encounter_id="enc-b2",
        case_id="synthetic:standard-002",
        assigned=2,
        expert=3,
        direction=TriageDirection.OVER_TRIAGE,
        started_at=t2,
        trainee_id="trainee-b",
    )

    difficulty_by_case = {
        "synthetic:trap-001": "TRAP",
        "synthetic:standard-001": "STANDARD",
        "synthetic:standard-002": "STANDARD",
    }

    result = compute_cohort_analytics(
        "cohort-1", [a_under, b_correct, b_over], difficulty_by_case
    )

    # Cohort-wide headline numbers: 3 scored, one of each direction.
    assert result.cohortId == "cohort-1"
    assert result.totalEncounters == 3
    assert result.totalTrainees == 2
    assert result.underTriageRate == 1 / 3
    assert result.overTriageRate == 1 / 3
    assert result.correctRate == 1 / 3
    # |levelsOff|: 1 (under) + 0 (correct) + 1 (over) -> mean 2/3.
    assert result.meanLevelsOffAbs == 2 / 3

    # Per-trainee rows: A (under-triage rate 1.0) sorts before B (0.0).
    assert [row.traineeId for row in result.trainees] == ["trainee-a", "trainee-b"]
    a_row, b_row = result.trainees
    assert a_row.totalEncounters == 1
    assert a_row.underTriageRate == 1.0
    assert a_row.correctRate == 0.0
    assert b_row.totalEncounters == 2
    assert b_row.underTriageRate == 0.0
    assert b_row.correctRate == 0.5

    # byDifficulty: trap holds A's single under-triage; standard holds B's two.
    assert result.byDifficulty is not None
    assert result.byDifficulty.trap.totalEncounters == 1
    assert result.byDifficulty.trap.underTriageRate == 1.0
    assert result.byDifficulty.standard.totalEncounters == 2
    assert result.byDifficulty.standard.underTriageRate == 0.0


def test_compute_cohort_analytics_empty_is_zeroed() -> None:
    """An unknown/empty cohort yields a zeroed report, byDifficulty None."""
    result = compute_cohort_analytics("cohort-empty", [], {"synthetic:x": "TRAP"})

    assert result.cohortId == "cohort-empty"
    assert result.totalTrainees == 0
    assert result.totalEncounters == 0
    assert result.underTriageRate == 0.0
    assert result.overTriageRate == 0.0
    assert result.correctRate == 0.0
    assert result.meanLevelsOffAbs == 0.0
    assert result.byDifficulty is None
    assert result.trainees == []


def test_compute_cohort_analytics_groups_anonymous_trainee() -> None:
    """An encounter with a None traineeId groups under the '(anonymous)' sentinel."""
    t0 = datetime(2026, 6, 9, tzinfo=UTC)
    anon = _scored_encounter(
        encounter_id="enc-anon",
        case_id="synthetic:standard-001",
        assigned=4,
        expert=3,
        direction=TriageDirection.UNDER_TRIAGE,
        started_at=t0,
        trainee_id=None,
    )

    result = compute_cohort_analytics("cohort-1", [anon])

    assert result.totalTrainees == 1
    assert result.totalEncounters == 1
    assert [row.traineeId for row in result.trainees] == ["(anonymous)"]
    assert result.trainees[0].underTriageRate == 1.0
    # No difficulty map provided -> byDifficulty stays None.
    assert result.byDifficulty is None


def test_compute_cohort_analytics_without_difficulty_map_leaves_by_difficulty_none() -> (
    None
):
    """Omitting the map keeps byDifficulty None even with scored encounters."""
    t0 = datetime(2026, 6, 9, tzinfo=UTC)
    enc = _scored_encounter(
        encounter_id="enc-1",
        case_id="synthetic:anything",
        assigned=3,
        expert=3,
        direction=TriageDirection.CORRECT,
        started_at=t0,
        trainee_id="trainee-a",
    )

    result = compute_cohort_analytics("cohort-1", [enc])

    assert result.totalEncounters == 1
    assert result.byDifficulty is None
