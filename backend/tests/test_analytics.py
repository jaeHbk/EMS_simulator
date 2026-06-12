"""Unit tests for the pure ``compute_analytics`` aggregation.

These exercise the deterministic core directly with hand-built encounters and an
explicit ``difficulty_by_case`` map — no I/O, no routes, no store. The route's job
(resolving difficulty via ``data.get_case``) is covered in test_api.py; here we
pin the segmentation math itself.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import Encounter, Stage
from app.models.score import EsiResult, ScoreReport, TriageDirection
from app.scoring.analytics import compute_analytics


def _scored_encounter(
    *,
    encounter_id: str,
    case_id: str,
    assigned: int,
    expert: int,
    direction: TriageDirection,
    started_at: datetime,
) -> Encounter:
    """A FEEDBACK-stage encounter carrying a minimal but valid ScoreReport."""
    return Encounter(
        encounterId=encounter_id,
        caseId=case_id,
        stage=Stage.FEEDBACK,
        esiAssigned=assigned,
        startedAt=started_at,
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


def test_compute_analytics_segments_trap_vs_standard() -> None:
    """One TRAP under-triage + one STANDARD correct triage segment cleanly."""
    t0 = datetime(2026, 6, 9, tzinfo=UTC)
    t1 = datetime(2026, 6, 9, 0, 5, tzinfo=UTC)

    trap_under = _scored_encounter(
        encounter_id="enc-trap",
        case_id="synthetic:trap-001",
        assigned=4,
        expert=3,
        direction=TriageDirection.UNDER_TRIAGE,
        started_at=t0,
    )
    standard_correct = _scored_encounter(
        encounter_id="enc-std",
        case_id="synthetic:standard-001",
        assigned=3,
        expert=3,
        direction=TriageDirection.CORRECT,
        started_at=t1,
    )

    difficulty_by_case = {
        "synthetic:trap-001": "TRAP",
        "synthetic:standard-001": "STANDARD",
    }

    result = compute_analytics(
        "trainee-x", [trap_under, standard_correct], difficulty_by_case
    )

    # Headline (un-segmented) numbers: 2 scored, one under-triage.
    assert result.totalEncounters == 2
    assert result.underTriageRate == 0.5

    assert result.byDifficulty is not None
    # The trap bucket: its single encounter was an under-triage.
    assert result.byDifficulty.trap.totalEncounters == 1
    assert result.byDifficulty.trap.underTriageRate == 1.0
    # The standard bucket: its single encounter was correct.
    assert result.byDifficulty.standard.totalEncounters == 1
    assert result.byDifficulty.standard.underTriageRate == 0.0


def test_compute_analytics_none_difficulty_buckets_as_standard() -> None:
    """A case with no difficulty entry (None) is treated as STANDARD."""
    t0 = datetime(2026, 6, 9, tzinfo=UTC)
    enc = _scored_encounter(
        encounter_id="enc-1",
        case_id="synthetic:unknown-001",
        assigned=4,
        expert=3,
        direction=TriageDirection.UNDER_TRIAGE,
        started_at=t0,
    )

    # Empty map => the case resolves to None => standard bucket.
    result = compute_analytics("trainee-y", [enc], {})

    assert result.byDifficulty is not None
    assert result.byDifficulty.trap.totalEncounters == 0
    assert result.byDifficulty.trap.underTriageRate == 0.0
    assert result.byDifficulty.standard.totalEncounters == 1
    assert result.byDifficulty.standard.underTriageRate == 1.0


def test_compute_analytics_without_difficulty_map_leaves_by_difficulty_none() -> None:
    """Omitting the map keeps the legacy behavior: byDifficulty stays None."""
    t0 = datetime(2026, 6, 9, tzinfo=UTC)
    enc = _scored_encounter(
        encounter_id="enc-1",
        case_id="synthetic:anything",
        assigned=3,
        expert=3,
        direction=TriageDirection.CORRECT,
        started_at=t0,
    )

    result = compute_analytics("trainee-z", [enc])

    assert result.totalEncounters == 1
    assert result.byDifficulty is None


def test_compute_analytics_empty_with_map_is_zeroed_and_none() -> None:
    """No scored encounters => zeroed report, byDifficulty None even with a map."""
    result = compute_analytics("trainee-empty", [], {"synthetic:x": "TRAP"})

    assert result.totalEncounters == 0
    assert result.byDifficulty is None
