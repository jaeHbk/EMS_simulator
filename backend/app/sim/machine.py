"""The encounter state machine.

This module is the single authority over encounter stage transitions. The client
never advances stages itself; it posts actions and the server applies them here.

Design rules enforced here:

* Forward-only progression along ``STAGE_ORDER`` (CASE_LOAD -> HISTORY -> VITALS ->
  ESI_ASSIGNMENT -> INTERVENTIONS -> FEEDBACK). Any backward or skip-ahead jump
  raises :class:`StageError`.
* Each action is only legal in its own stage (history during HISTORY, vitals during
  VITALS, ESI during ESI_ASSIGNMENT, interventions during INTERVENTIONS).
* The case's ``expert`` labels are NEVER copied onto the Encounter. They surface to
  the client only via ``scoreReport`` at FEEDBACK, and scoring is a different module.
* ``measure_vitals`` reveals only the fields the trainee explicitly requested,
  copying them from ``case.presentation.groundTruthVitals``.

Functions are pure-ish: they return a new ``Encounter`` (a deep copy with the
requested change applied) rather than mutating the input in place.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models import Encounter, HistoryTurn, Stage, TriageCase, Vitals
from app.models.encounter import STAGE_ORDER

__all__ = [
    "StageError",
    "advance",
    "assign_esi",
    "create_encounter",
    "measure_vitals",
    "order_interventions",
    "record_history_turn",
]

# Index of each stage in the canonical forward order, for cheap ordering checks.
_STAGE_INDEX: dict[Stage, int] = {stage: i for i, stage in enumerate(STAGE_ORDER)}


class StageError(Exception):
    """Raised when an action or transition is illegal for the encounter's stage.

    Covers both illegal stage jumps (backward / skip-ahead in ``advance``) and
    actions attempted outside their legal stage (e.g. recording a history turn
    while not in HISTORY).
    """


def _now() -> datetime:
    """Timezone-aware UTC timestamp (kept in one place for testability)."""
    return datetime.now(UTC)


def _require_stage(enc: Encounter, expected: Stage, action: str) -> None:
    """Guard: raise StageError unless the encounter is in ``expected``."""
    if enc.stage is not expected:
        raise StageError(
            f"Cannot {action}: encounter is in stage {enc.stage.value}, "
            f"but this action is only legal during {expected.value}."
        )


def create_encounter(case: TriageCase, trainee_id: str | None = None) -> Encounter:
    """Create a fresh Encounter for ``case`` at the CASE_LOAD stage.

    Copies the chief complaint and stamps ``startedAt``. Critically, it copies
    NOTHING from ``case.expert`` (or the hidden history detail) onto the Encounter
    — those stay server-side until FEEDBACK and are surfaced only via scoring.

    ``trainee_id`` is an OPAQUE per-browser learner id used only to group
    encounters for progress analytics — it is not an identity or credential.
    When unset (the default), the encounter has no trainee association.
    """
    return Encounter(
        encounterId=str(uuid.uuid4()),
        caseId=case.caseId,
        stage=Stage.CASE_LOAD,
        chiefComplaint=case.presentation.chiefComplaint,
        startedAt=_now(),
        traineeId=trainee_id,
    )


def advance(enc: Encounter, to: Stage) -> Encounter:
    """Advance the encounter exactly ONE step FORWARD to ``to``.

    Transitions are strictly single-step along ``STAGE_ORDER``. Advancing to the
    same stage, to an earlier stage, to a stage not in the order, or skipping a
    stage all raise :class:`StageError`. Single-step enforcement is a clinical
    safety requirement: a trainee must not reach FEEDBACK (scoring) without having
    passed through ESI_ASSIGNMENT, etc. Reaching FEEDBACK stamps ``completedAt``.

    Note for the integrator: ``advance(enc, FEEDBACK)`` only moves the stage; the
    API route composes scoring + narrative and attaches the ScoreReport itself.
    """
    if to not in _STAGE_INDEX:
        raise StageError(f"Unknown target stage: {to!r}.")

    current_idx = _STAGE_INDEX[enc.stage]
    target_idx = _STAGE_INDEX[to]

    if target_idx != current_idx + 1:
        raise StageError(
            f"Illegal transition {enc.stage.value} -> {to.value}: "
            "transitions are forward-only and exactly one step at a time."
        )

    updated = enc.model_copy(deep=True)
    updated.stage = to
    if to is Stage.FEEDBACK:
        updated.completedAt = _now()
    return updated


def record_history_turn(enc: Encounter, turn: HistoryTurn) -> Encounter:
    """Append a history-taking turn to the transcript. Legal only during HISTORY."""
    _require_stage(enc, Stage.HISTORY, "record a history turn")

    updated = enc.model_copy(deep=True)
    updated.history = [*updated.history, turn.model_copy(deep=True)]
    return updated


def measure_vitals(enc: Encounter, case: TriageCase, fields: list[str]) -> Encounter:
    """Reveal the requested vitals fields. Legal only during VITALS.

    Each name in ``fields`` must be a real ``Vitals`` field; an unknown name raises
    ``ValueError``. For each requested field the ground-truth value from
    ``case.presentation.groundTruthVitals`` is copied onto the encounter's
    ``measuredVitals``. Fields not requested stay as they were (``None`` until
    measured), so only what the trainee chose to measure is revealed.
    """
    _require_stage(enc, Stage.VITALS, "measure vitals")

    valid_fields = set(Vitals.model_fields)
    for name in fields:
        if name not in valid_fields:
            raise ValueError(
                f"Unknown vitals field {name!r}. "
                f"Valid fields: {sorted(valid_fields)}."
            )

    truth = case.presentation.groundTruthVitals
    updated = enc.model_copy(deep=True)
    revealed = updated.measuredVitals.model_dump()
    for name in fields:
        revealed[name] = getattr(truth, name)
    updated.measuredVitals = Vitals.model_validate(revealed)
    return updated


def assign_esi(enc: Encounter, esi: int) -> Encounter:
    """Record the trainee's ESI decision (1-5). Legal only during ESI_ASSIGNMENT.

    No feedback is produced here; the value is simply stored. Out-of-range values
    raise ``ValueError`` (the contract limits ESI to 1..5).
    """
    _require_stage(enc, Stage.ESI_ASSIGNMENT, "assign ESI")

    if not isinstance(esi, int) or isinstance(esi, bool) or not (1 <= esi <= 5):
        raise ValueError(f"ESI must be an integer 1..5, got {esi!r}.")

    updated = enc.model_copy(deep=True)
    updated.esiAssigned = esi
    return updated


def order_interventions(enc: Encounter, items: list[str]) -> Encounter:
    """Record the critical interventions the trainee ordered.

    Legal only during INTERVENTIONS. Replaces any previously ordered set with
    ``items`` (the trainee submits their full intervention list for the stage).
    """
    _require_stage(enc, Stage.INTERVENTIONS, "order interventions")

    updated = enc.model_copy(deep=True)
    updated.interventionsOrdered = list(items)
    return updated
