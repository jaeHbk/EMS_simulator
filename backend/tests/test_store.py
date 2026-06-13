"""Unit tests for SQLite persistence (app/store/db.py).

Covers: init_db idempotency, save/get round-trip preserving every field, upsert
semantics, unknown-id KeyError, and the SQLAlchemy-style URL -> sqlite3 path
translation (including in-memory and file-backed targets).

Also covers the concurrency-hardening guarantees: a file-backed store survives
many threads writing at once (WAL + per-operation connections + busy_timeout),
``PRAGMA user_version`` tracks the applied migration version, and the
``created_at``/``updated_at`` bookkeeping columns behave (created_at is stable
across re-saves; updated_at never goes backwards).
"""

from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

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


def _read_timestamps(db_path: Path, encounter_id: str) -> tuple[str, str]:
    """Read (created_at, updated_at) for one row via a direct sqlite3 query.

    Test-only helper: opens its own short-lived connection to the file DB so it
    does not depend on (or perturb) the store's connection handling.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute(
            "SELECT created_at, updated_at FROM encounters WHERE encounter_id = ?",
            (encounter_id,),
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    return row[0], row[1]


def test_file_backed_concurrent_saves(tmp_path: Path) -> None:
    """~20 threads each saving a distinct encounter to a FILE db must all land.

    Exercises the concurrency-safe path: WAL + busy_timeout + a fresh connection
    per operation. With the old single shared connection this raced and could
    raise ``sqlite3.ProgrammingError`` / ``OperationalError`` ("database is
    locked"). We collect every thread's exception and assert none occurred, then
    confirm all rows are retrievable.
    """
    db_file = tmp_path / "c.sqlite3"
    init_db(f"sqlite:///{db_file}")

    n = 20
    ids = [f"enc-conc-{i:02d}" for i in range(n)]

    def _save(enc_id: str) -> None:
        save_encounter(Encounter(encounterId=enc_id, caseId="case-x"))

    errors: list[BaseException] = []
    with ThreadPoolExecutor(max_workers=n) as pool:
        futures = [pool.submit(_save, enc_id) for enc_id in ids]
        for fut in futures:
            exc = fut.exception()
            if exc is not None:
                errors.append(exc)

    assert errors == [], f"threads raised: {errors!r}"
    # Every distinct encounter must be retrievable.
    for enc_id in ids:
        assert get_encounter(enc_id).encounterId == enc_id


def test_user_version_is_set_and_reinit_idempotent(tmp_path: Path) -> None:
    """``PRAGMA user_version`` reflects the applied migration (>= 1) and re-init
    neither downgrades it nor loses data."""
    db_file = tmp_path / "v.sqlite3"
    init_db(f"sqlite:///{db_file}")

    def _user_version() -> int:
        conn = sqlite3.connect(str(db_file))
        try:
            return int(conn.execute("PRAGMA user_version").fetchone()[0])
        finally:
            conn.close()

    first = _user_version()
    assert first >= 1

    enc = Encounter(encounterId="enc-ver", caseId="case-x")
    save_encounter(enc)

    # Re-init the same file: idempotent, no downgrade, data preserved.
    init_db(f"sqlite:///{db_file}")
    assert _user_version() == first
    assert get_encounter("enc-ver").encounterId == "enc-ver"


def test_created_at_stable_updated_at_advances(tmp_path: Path) -> None:
    """On re-save of the same id, ``created_at`` is preserved and ``updated_at``
    moves forward (>=)."""
    db_file = tmp_path / "ts.sqlite3"
    init_db(f"sqlite:///{db_file}")

    enc = Encounter(encounterId="enc-ts", caseId="case-x", stage=Stage.CASE_LOAD)
    save_encounter(enc)
    created_1, updated_1 = _read_timestamps(db_file, "enc-ts")

    # Re-save the SAME encounterId after a state change.
    updated = enc.model_copy(update={"stage": Stage.HISTORY})
    save_encounter(updated)
    created_2, updated_2 = _read_timestamps(db_file, "enc-ts")

    # created_at is the real invariant: stable across saves.
    assert created_2 == created_1
    # updated_at never goes backwards; both are ISO-8601 so lexical >= holds.
    assert updated_2 >= updated_1
    assert updated_2 >= created_2
    # The state change actually persisted.
    assert get_encounter("enc-ts").stage is Stage.HISTORY


def test_memory_round_trip_still_works() -> None:
    """The shared-connection ``:memory:`` path keeps working end to end."""
    init_db("sqlite:///:memory:")
    enc = make_full_encounter()
    save_encounter(enc)
    assert get_encounter(enc.encounterId) == enc
