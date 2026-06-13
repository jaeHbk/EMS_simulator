"""Encounter models — mirrors shared/schemas/encounter.schema.json."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from app.models.score import ScoreReport
from app.models.triage_case import Vitals


class Stage(str, Enum):
    """Workflow stages, in order. Transitions enforced server-side in app/sim/."""

    CASE_LOAD = "CASE_LOAD"
    HISTORY = "HISTORY"
    VITALS = "VITALS"
    ESI_ASSIGNMENT = "ESI_ASSIGNMENT"
    INTERVENTIONS = "INTERVENTIONS"
    FEEDBACK = "FEEDBACK"


# Canonical forward order of the state machine. app/sim/ is the only place that
# should advance an encounter through these.
STAGE_ORDER: tuple[Stage, ...] = (
    Stage.CASE_LOAD,
    Stage.HISTORY,
    Stage.VITALS,
    Stage.ESI_ASSIGNMENT,
    Stage.INTERVENTIONS,
    Stage.FEEDBACK,
)


class Role(str, Enum):
    trainee = "trainee"
    patient = "patient"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HistoryTurn(_Strict):
    role: Role
    text: str


class Encounter(_Strict):
    """Live state of one trainee triaging one case. The wire format for the client.

    Never includes the case's expert labels until `stage == FEEDBACK` (then they
    surface via `scoreReport`).
    """

    encounterId: str
    caseId: str
    stage: Stage = Stage.CASE_LOAD
    chiefComplaint: str = ""
    history: list[HistoryTurn] = Field(default_factory=list)
    measuredVitals: Vitals = Field(default_factory=Vitals)
    esiAssigned: int | None = Field(default=None, ge=1, le=5)
    interventionsOrdered: list[str] = Field(default_factory=list)
    scoreReport: ScoreReport | None = None
    startedAt: datetime | None = None
    completedAt: datetime | None = None
    # Opaque per-browser learner id for progress analytics. NOT an identity or
    # credential — purely an analytics grouping key. Optional/nullable so existing
    # producers (and the wire format) are unaffected when it is unset.
    traineeId: str | None = None
    # Opaque cohort code grouping encounters for an instructor's aggregate view.
    # NOT an identity or credential — purely a grouping key. Optional/nullable so
    # existing producers (and the wire format) are unaffected when it is unset.
    cohortId: str | None = None
