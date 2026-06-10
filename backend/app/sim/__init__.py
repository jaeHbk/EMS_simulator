"""Encounter state machine — the ONLY place transitions are enforced.

Public surface (see docs/MODULE_INTERFACES.md):
    create_encounter, advance, record_history_turn, measure_vitals,
    assign_esi, order_interventions, and StageError.
"""

from app.sim.machine import (
    StageError,
    advance,
    assign_esi,
    create_encounter,
    measure_vitals,
    order_interventions,
    record_history_turn,
)

__all__ = [
    "StageError",
    "advance",
    "assign_esi",
    "create_encounter",
    "measure_vitals",
    "order_interventions",
    "record_history_turn",
]
