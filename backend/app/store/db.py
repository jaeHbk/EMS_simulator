"""SQLite persistence for encounters using the stdlib ``sqlite3`` module.

Encounters are stored as a single JSON column via ``Encounter.model_dump_json``
and reloaded with ``Encounter.model_validate_json`` — the Pydantic model is the
schema of record, so the table stays a thin key/value blob store. No SQLAlchemy.

``init_db`` is idempotent (safe to call repeatedly) and records the resolved
database target so ``save_encounter`` / ``get_encounter`` can reuse it.

The ``database_url`` follows the project convention (``app/config.py``) of a
SQLAlchemy-style URL, e.g. ``sqlite:///./ed_triage.sqlite3``. We translate it to a
plain filesystem path (or ``:memory:``) for stdlib ``sqlite3``.

Concurrency model
-----------------
Under uvicorn the store is touched from many worker threads at once. A single
shared connection committing per write races and can lock or corrupt the file,
so for *file-backed* databases each operation opens its own short-lived
connection. To make concurrent writers cooperate we enable WAL journaling and a
``busy_timeout`` (see ``_apply_pragmas``).

``:memory:`` is special: every new connection to ``:memory:`` is a fresh, empty
database, so per-operation connections would lose all data. The in-memory store
therefore keeps ONE shared persistent connection for the process lifetime.

Schema is versioned with ``PRAGMA user_version`` and brought forward by an
ordered set of migrations (see ``_MIGRATIONS`` / ``_migrate``), so the on-disk
shape can evolve without ad-hoc ``ALTER`` calls scattered across the code.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from app.models import Encounter

__all__ = [
    "count_encounters",
    "get_encounter",
    "init_db",
    "list_encounters_by_cohort",
    "list_encounters_by_trainee",
    "save_encounter",
]

# ---------------------------------------------------------------------------
# Schema migrations
# ---------------------------------------------------------------------------
# Bump ``_CURRENT_VERSION`` and append a migration to ``_MIGRATIONS`` whenever
# the on-disk shape changes. Each migration takes a live connection and runs the
# DDL/DML to move the schema from ``version - 1`` to ``version``; ``_migrate``
# wraps it in a transaction and records the new ``user_version``.

_CURRENT_VERSION = 1


def _migration_1(conn: sqlite3.Connection) -> None:
    """v1: create the ``encounters`` table.

    A thin key/value blob keyed by ``encounter_id`` plus bookkeeping timestamps.
    ``created_at`` is set once on insert and preserved across updates;
    ``updated_at`` advances on every write.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS encounters (
            encounter_id TEXT PRIMARY KEY,
            payload      TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        )
        """
    )


# Ordered version -> migration. Index i (1-based) brings the schema to version i.
_MIGRATIONS: dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migration_1,
}

# ---------------------------------------------------------------------------
# Module state
# ---------------------------------------------------------------------------
# Resolved sqlite3 target set by init_db (a file path or ":memory:").
_db_path: str | None = None

# Whether the current target is the in-memory database.
_is_memory: bool = False

# The single shared connection for ":memory:" only. File-backed databases use a
# fresh connection per operation (see ``_operation``), so this stays ``None`` for
# them.
_memory_conn: sqlite3.Connection | None = None


def _resolve_path(database_url: str) -> str:
    """Translate a SQLAlchemy-style sqlite URL into a stdlib sqlite3 target.

    Accepts the forms used in the project:
      * ``sqlite:///./ed_triage.sqlite3``  -> ``./ed_triage.sqlite3`` (relative)
      * ``sqlite:////abs/path.sqlite3``    -> ``/abs/path.sqlite3``    (absolute)
      * ``sqlite:///:memory:``             -> ``:memory:``
      * a bare path or ``:memory:`` is passed through unchanged.
    """
    prefix = "sqlite:///"
    if database_url.startswith(prefix):
        remainder = database_url[len(prefix) :]
        if remainder == ":memory:" or remainder == "":
            return ":memory:"
        # A leading slash here means the original URL had four slashes -> absolute.
        return remainder
    return database_url


def _apply_pragmas(conn: sqlite3.Connection, *, is_memory: bool) -> None:
    """Apply the connection-level pragmas the store relies on.

    ``busy_timeout`` makes writers wait (rather than fail immediately) when the
    database is momentarily locked by another connection. For file-backed
    databases WAL journaling lets readers and a writer proceed concurrently;
    WAL is meaningless for ``:memory:`` and would force an undesirable on-disk
    journal, so it is skipped there.
    """
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    if not is_memory:
        conn.execute("PRAGMA journal_mode = WAL")


def _connect(target: str, *, is_memory: bool) -> sqlite3.Connection:
    """Open a connection to ``target`` with the store's pragmas applied.

    ``check_same_thread=False`` is required for the shared ``:memory:``
    connection (touched from several threads). File-backed connections are
    short-lived and per-operation, but we keep the flag uniform for simplicity;
    it is safe because each such connection is used by exactly one thread.
    """
    conn = sqlite3.connect(target, check_same_thread=False)
    _apply_pragmas(conn, is_memory=is_memory)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Bring ``conn``'s schema up to ``_CURRENT_VERSION``. Idempotent.

    Reads ``PRAGMA user_version`` and runs each pending migration in order, one
    per transaction, recording the new version after each. A database already at
    (or beyond) the current version is left untouched — no downgrade.
    """
    current = int(conn.execute("PRAGMA user_version").fetchone()[0])
    for version in range(current + 1, _CURRENT_VERSION + 1):
        migration = _MIGRATIONS[version]
        with conn:  # transaction: commit on success, rollback on error
            migration(conn)
            # PRAGMA user_version does not accept a bound parameter; version is an
            # int we control, so interpolation is safe here.
            conn.execute(f"PRAGMA user_version = {version}")


def init_db(database_url: str) -> None:
    """Initialize (or re-point) the encounter store. Safe to call repeatedly.

    Resolves ``database_url`` to a sqlite3 target and ensures the schema is at
    ``_CURRENT_VERSION``. For ``:memory:`` a single shared connection is opened
    and kept. For file-backed databases a short-lived connection applies pragmas
    and migrations, then closes — subsequent operations open their own
    connections. Calling again with the same target is idempotent; switching
    targets closes any prior in-memory connection first.
    """
    global _db_path, _is_memory, _memory_conn

    path = _resolve_path(database_url)
    is_memory = path == ":memory:"

    # Already pointed at this exact target: re-run migrations (idempotent) and
    # return without dropping the shared in-memory connection or its data.
    if _db_path == path:
        if is_memory and _memory_conn is not None:
            _migrate(_memory_conn)
            return
        if not is_memory:
            conn = _connect(path, is_memory=False)
            try:
                _migrate(conn)
            finally:
                conn.close()
            return

    # Switching targets (or first init): drop any prior in-memory connection.
    if _memory_conn is not None:
        _memory_conn.close()
        _memory_conn = None

    _db_path = path
    _is_memory = is_memory

    if is_memory:
        _memory_conn = _connect(path, is_memory=True)
        _migrate(_memory_conn)
    else:
        conn = _connect(path, is_memory=False)
        try:
            _migrate(conn)
        finally:
            conn.close()


@contextmanager
def _operation() -> Iterator[sqlite3.Connection]:
    """Yield a connection for one store operation, committing at the end.

    For ``:memory:`` the shared connection is yielded and committed but never
    closed (closing it would discard the database). For file-backed databases a
    fresh connection is opened per operation and closed in ``finally`` — this is
    what makes concurrent access from many threads safe.
    """
    if _db_path is None:
        raise RuntimeError("Store not initialized: call init_db(database_url) first.")

    if _is_memory:
        if _memory_conn is None:  # pragma: no cover - defensive; init_db sets it
            raise RuntimeError(
                "Store not initialized: call init_db(database_url) first."
            )
        yield _memory_conn
        _memory_conn.commit()
        return

    conn = _connect(_db_path, is_memory=False)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def save_encounter(enc: Encounter) -> None:
    """Insert or update an encounter, keyed by ``encounterId``.

    Serializes the whole model to JSON via ``model_dump_json`` so every field
    round-trips, then upserts it. On insert, ``created_at`` and ``updated_at`` are
    both set to now. On conflict, ``payload`` and ``updated_at`` are refreshed but
    ``created_at`` is left untouched (it is simply not in the UPDATE SET clause),
    so it stays stable across the encounter's lifetime.
    """
    now = datetime.now(UTC).isoformat()
    with _operation() as conn:
        conn.execute(
            "INSERT INTO encounters (encounter_id, payload, created_at, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(encounter_id) DO UPDATE SET "
            "    payload = excluded.payload, "
            "    updated_at = excluded.updated_at",
            (enc.encounterId, enc.model_dump_json(), now, now),
        )


def get_encounter(encounter_id: str) -> Encounter:
    """Load an encounter by id. Raises ``KeyError`` if it is not stored."""
    with _operation() as conn:
        row = conn.execute(
            "SELECT payload FROM encounters WHERE encounter_id = ?",
            (encounter_id,),
        ).fetchone()
    if row is None:
        raise KeyError(f"No encounter with id {encounter_id!r}.")
    return Encounter.model_validate_json(row[0])


def count_encounters() -> int:
    """Return the total number of persisted encounters.

    A single ``COUNT(*)`` over the ``encounters`` table — no payloads are
    deserialized and no per-encounter content is touched, so this is cheap and
    PII-free (it backs the operational ``/stats`` endpoint).
    """
    with _operation() as conn:
        row = conn.execute("SELECT COUNT(*) FROM encounters").fetchone()
    return int(row[0])


def list_encounters_by_trainee(trainee_id: str) -> list[Encounter]:
    """Return all stored encounters for ``trainee_id``, oldest first.

    This is a demo-scale full-table scan: every encounter is deserialized and
    filtered in Python on ``traineeId``. Results are ordered by ``startedAt``
    ascending so analytics can build a chronological learning curve. Encounters
    with a ``None`` ``startedAt`` sort *first* (treated as the earliest), keeping
    the ordering total and deterministic.
    """
    with _operation() as conn:
        rows = conn.execute("SELECT payload FROM encounters").fetchall()
    matches = [
        enc
        for enc in (Encounter.model_validate_json(row[0]) for row in rows)
        if enc.traineeId == trainee_id
    ]
    # datetime.min is naive; the stored startedAt values are tz-aware, so use a
    # tz-aware floor for None to keep all comparisons valid.
    earliest = datetime.min.replace(tzinfo=UTC)
    matches.sort(key=lambda enc: enc.startedAt or earliest)
    return matches


def list_encounters_by_cohort(cohort_id: str) -> list[Encounter]:
    """Return all stored encounters for ``cohort_id``, oldest first.

    This is a demo-scale full-table scan: every encounter is deserialized and
    filtered in Python on ``cohortId``. Results are ordered by ``startedAt``
    ascending so a cohort's aggregate view can be built chronologically.
    Encounters with a ``None`` ``startedAt`` sort *first* (treated as the
    earliest), keeping the ordering total and deterministic.
    """
    with _operation() as conn:
        rows = conn.execute("SELECT payload FROM encounters").fetchall()
    matches = [
        enc
        for enc in (Encounter.model_validate_json(row[0]) for row in rows)
        if enc.cohortId == cohort_id
    ]
    # datetime.min is naive; the stored startedAt values are tz-aware, so use a
    # tz-aware floor for None to keep all comparisons valid.
    earliest = datetime.min.replace(tzinfo=UTC)
    matches.sort(key=lambda enc: enc.startedAt or earliest)
    return matches
