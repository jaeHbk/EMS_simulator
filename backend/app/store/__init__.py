"""SQLite persistence for encounters (stdlib ``sqlite3``, no ORM).

Public surface (see docs/MODULE_INTERFACES.md):
    init_db, save_encounter, get_encounter.
"""

from app.store.db import get_encounter, init_db, save_encounter

__all__ = ["get_encounter", "init_db", "save_encounter"]
