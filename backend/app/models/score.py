"""ScoreReport models — mirrors shared/schemas/score-report.schema.json.

The numbers here are produced ONLY by deterministic, rule-based code in
app/scoring/. The LLM authors `narrative`, grounded in these numbers; it never
produces or alters a score.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class TriageDirection(str, Enum):
    CORRECT = "CORRECT"
    OVER_TRIAGE = "OVER_TRIAGE"
    # UNDER_TRIAGE = assigned a less-acute (higher) level than expert. The headline
    # safety failure this tool exists to reduce; scored with a heavier penalty.
    UNDER_TRIAGE = "UNDER_TRIAGE"


class DimensionKey(str, Enum):
    ESI_ACCURACY = "ESI_ACCURACY"
    HISTORY_COMPLETENESS = "HISTORY_COMPLETENESS"
    VITALS_ACQUISITION = "VITALS_ACQUISITION"
    INTERVENTION_RECOGNITION = "INTERVENTION_RECOGNITION"
    OUTCOME_ALIGNMENT = "OUTCOME_ALIGNMENT"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EsiResult(_Strict):
    assigned: int = Field(ge=1, le=5)
    expert: int = Field(ge=1, le=5)
    correct: bool
    triageDirection: TriageDirection
    levelsOff: int = Field(
        description="assigned - expert. Negative = over-triage, positive = under-triage."
    )


class ScoreDimension(_Strict):
    key: DimensionKey
    label: str
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0, le=1.0)
    detail: str


class ScoreReport(_Strict):
    encounterId: str
    esi: EsiResult
    dimensions: list[ScoreDimension]
    overallPercent: float = Field(ge=0.0, le=100.0)
    narrative: str
    missedRedFlags: list[str] = Field(default_factory=list)
