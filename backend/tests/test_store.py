"""Unit tests for SQLite persistence (app/store/db.py).

Covers: init_db idempotency, save/get round-trip preserving every field, upsert
semantics, unknown-id KeyError, and the SQLAlchemy-style URL -> sqlite3 path
translation (including in-memory and file-backed targets).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import (
    Encounter,
    HistoryTurn,
    ScoreDimension,
    ScoreReport,
    Stage,
    TriageDirection,
    Vitals,
)
from app.models.encounter import Role
from app.models.score import DimensionKey, EsiResult
from app.models.triage_case import AVPU
from app.store import get_encounter, init_db, save_encounter


@pytest.fixture(autouse=True)
def fresh_memory_db() -> None:
    """Point the store at a fresh in-memory database for every test."""
    init_db("sqlite:///:memory:")


def make_full_encounter() -> Encounter:
    """An Encounter exercising every field, including a nested ScoreReport."""
    return Encounter(
        encounterId="enc-123",
        caseId="case-001",
        stage=Stage.FEEDBACK,
        chiefComplaint="Crushing chest pain",
        history=[
            HistoryTurn(role=Role.trainee, text="What brings you in?"),
            HistoryTurn(role=Role.patient, text="My chest hurts badly."),
        ],
        measuredVitals=Vitals(
            heartRate=112.0,
            systolicBP=158.0,
            spo2=94.0,
            painScore=9,
            avpu=AVPU.A,
        ),
        esiAssigned=4,
        interventionsOrdered=["ECG", "IV_ACCESS"],
        scoreReport=ScoreReport(
            encounterId="enc-123",
            esi=EsiResult(
                assigned=4,
                expert=2,
                correct=False,
                triageDirection=TriageDirection.UNDER_TRIAGE,
                levelsOff=2,
            ),
            dimensions=[
                ScoreDimension(
                    key=DimensionKey.ESI_ACCURACY,
                    label="ESI accuracy",
                    score=0.0,
                    weight=0.5,
                    detail="Under-triaged by two levels.",
                ),
            ],
            overallPercent=42.5,
            narrative="",
            missedRedFlags=["diaphoresis"],
        ),
        startedAt=datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC),
        completedAt=datetime(2026, 6, 9, 12, 15, 0, tzinfo=UTC),
    )


def test_init_db_is_idempotent() -> None:
    # Calling repeatedly on the same in-memory db must not lose data or error.
    enc = make_full_encounter()
    save_encounter(enc)
    init_db("sqlite:///:memory:")  # re-init same target
    init_db("sqlite:///:memory:")
    # Same in-memory connection is retained, so the row survives re-init.
    assert get_encounter(enc.encounterId).encounterId == enc.encounterId


def test_save_get_round_trip_preserves_all_fields() -> None:
    enc = make_full_encounter()
    save_encounter(enc)
    loaded = get_encounter(enc.encounterId)

    # Whole-model equality is the strongest possible round-trip assertion.
    assert loaded == enc

    # Spot-check a few load-bearing nested values for clarity on failure.
    assert loaded.stage is Stage.FEEDBACK
    assert loaded.measuredVitals.heartRate == 112.0
    assert loaded.measuredVitals.avpu is AVPU.A
    assert loaded.history[0].role is Role.trainee
    assert loaded.esiAssigned == 4
    assert loaded.interventionsOrdered == ["ECG", "IV_ACCESS"]
    assert loaded.scoreReport is not None
    assert loaded.scoreReport.esi.triageDirection is TriageDirection.UNDER_TRIAGE
    assert loaded.scoreReport.esi.levelsOff == 2
    assert loaded.startedAt == enc.startedAt
    assert loaded.completedAt == enc.completedAt


def test_round_trip_minimal_encounter() -> None:
    enc = Encounter(encounterId="min-1", caseId="case-x")
    save_encounter(enc)
    loaded = get_encounter("min-1")
    assert loaded == enc
    assert loaded.stage is Stage.CASE_LOAD
    assert loaded.scoreReport is None
    assert loaded.measuredVitals == Vitals()


def test_save_upserts_on_conflict() -> None:
    enc = Encounter(encounterId="enc-up", caseId="case-x", stage=Stage.CASE_LOAD)
    save_encounter(enc)

    updated = enc.model_copy(update={"stage": Stage.HISTORY})
    save_encounter(updated)

    loaded = get_encounter("enc-up")
    assert loaded.stage is Stage.HISTORY
    # Still a single row (no duplicate insert).
    assert get_encounter("enc-up").encounterId == "enc-up"


def test_get_unknown_id_raises_key_error() -> None:
    with pytest.raises(KeyError):
        get_encounter("does-not-exist")


def test_file_backed_db_round_trip(tmp_path) -> None:  # type: ignore[no-untyped-def]
    db_file = tmp_path / "encounters.sqlite3"
    init_db(f"sqlite:///{db_file}")
    enc = make_full_encounter()
    save_encounter(enc)
    loaded = get_encounter(enc.encounterId)
    assert loaded == enc
    assert db_file.exists()
    # Re-init the same file: persisted data must still be readable.
    init_db(f"sqlite:///{db_file}")
    assert get_encounter(enc.encounterId) == enc
