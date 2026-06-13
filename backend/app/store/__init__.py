"""SQLite persistence for encounters (stdlib ``sqlite3``, no ORM).

Public surface (see docs/MODULE_INTERFACES.md):
    init_db, save_encounter, get_encounter, list_encounters_by_trainee,
    list_encounters_by_cohort, count_encounters.
"""

from app.store.db import (
    count_encounters,
    get_encounter,
    init_db,
    list_encounters_by_cohort,
    list_encounters_by_trainee,
    save_encounter,
)

__all__ = [
    "count_encounters",
    "get_encounter",
    "init_db",
    "list_encounters_by_cohort",
    "list_encounters_by_trainee",
    "save_encounter",
]
