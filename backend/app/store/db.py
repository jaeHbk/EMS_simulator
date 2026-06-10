"""SQLite persistence for encounters using the stdlib ``sqlite3`` module.

Encounters are stored as a single JSON column via ``Encounter.model_dump_json``
and reloaded with ``Encounter.model_validate_json`` — the Pydantic model is the
schema of record, so the table stays a thin key/value blob store. No SQLAlchemy.

``init_db`` is idempotent (safe to call repeatedly) and records the resolved
database path so ``save_encounter`` / ``get_encounter`` can reuse it.

The ``database_url`` follows the project convention (``app/config.py``) of a
SQLAlchemy-style URL, e.g. ``sqlite:///./ed_triage.sqlite3``. We translate it to a
plain filesystem path (or ``:memory:``) for stdlib ``sqlite3``.
"""

from __future__ import annotations

import sqlite3

from app.models import Encounter

__all__ = ["get_encounter", "init_db", "save_encounter"]

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS encounters (
    encounter_id TEXT PRIMARY KEY,
    payload      TEXT NOT NULL
)
"""

# Resolved sqlite3 connection target set by init_db (a file path or ":memory:").
_db_path: str | None = None

# A persistent connection is required for ":memory:" databases, since each new
# connection to ":memory:" is a fresh, empty database. For file-backed databases
# we also keep it to avoid reopening on every call.
_conn: sqlite3.Connection | None = None


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


def init_db(database_url: str) -> None:
    """Initialize (or re-point) the encounter store. Safe to call repeatedly.

    Resolves ``database_url`` to a sqlite3 target, opens a connection, and ensures
    the ``encounters`` table exists. Calling again with a different URL switches the
    store to that target (the previous connection is closed first).
    """
    global _db_path, _conn

    path = _resolve_path(database_url)

    # If we're already pointed at this exact target with a live connection, just
    # ensure the table exists and return — idempotent.
    if _conn is not None and _db_path == path:
        _conn.execute(_CREATE_TABLE)
        _conn.commit()
        return

    # Switching targets (or first init): close any prior connection.
    if _conn is not None:
        _conn.close()
        _conn = None

    _conn = sqlite3.connect(path, check_same_thread=False)
    _db_path = path
    _conn.execute(_CREATE_TABLE)
    _conn.commit()


def _require_conn() -> sqlite3.Connection:
    if _conn is None:
        raise RuntimeError("Store not initialized: call init_db(database_url) first.")
    return _conn


def save_encounter(enc: Encounter) -> None:
    """Insert or update an encounter, keyed by ``encounterId``.

    Serializes the whole model to JSON via ``model_dump_json`` so every field
    round-trips, then upserts it.
    """
    conn = _require_conn()
    conn.execute(
        "INSERT INTO encounters (encounter_id, payload) VALUES (?, ?) "
        "ON CONFLICT(encounter_id) DO UPDATE SET payload = excluded.payload",
        (enc.encounterId, enc.model_dump_json()),
    )
    conn.commit()


def get_encounter(encounter_id: str) -> Encounter:
    """Load an encounter by id. Raises ``KeyError`` if it is not stored."""
    conn = _require_conn()
    row = conn.execute(
        "SELECT payload FROM encounters WHERE encounter_id = ?",
        (encounter_id,),
    ).fetchone()
    if row is None:
        raise KeyError(f"No encounter with id {encounter_id!r}.")
    return Encounter.model_validate_json(row[0])
