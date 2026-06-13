"""Cohort analytics models — mirrors shared/schemas/cohort-analytics.schema.json.

Cohort-level triage metrics for an instructor's aggregate view, computed
deterministically from stored ScoreReports by app/scoring/cohort.py. The cohort
id and the per-trainee ids are OPAQUE grouping/analytics keys — NOT identities or
credentials. These numbers are rule-based; no LLM is involved. Aggregates and
opaque codes only: no PII and no per-encounter content beyond counts/rates.

``DifficultyStats`` / ``ByDifficulty`` are REUSED from app.models.analytics (the
per-trainee analytics model) rather than redefined, keeping the difficulty-bucket
shape identical across the two analytics surfaces.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.analytics import ByDifficulty, DifficultyStats

__all__ = ["ByDifficulty", "CohortAnalytics", "CohortTraineeRow", "DifficultyStats"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CohortTraineeRow(_Strict):
    """One trainee's scored-encounter summary within a cohort.

    ``traineeId`` is the opaque per-browser learner id, or the sentinel
    ``"(anonymous)"`` for encounters that carried no traineeId. Not an identity.
    """

    traineeId: str
    totalEncounters: int = Field(ge=0)
    underTriageRate: float = Field(ge=0.0, le=1.0)
    correctRate: float = Field(ge=0.0, le=1.0)


class CohortAnalytics(_Strict):
    """Cohort-level learning summary. An unknown/empty cohort yields a zeroed
    report (totalTrainees/totalEncounters == 0, all rates 0.0, byDifficulty None,
    empty trainees), never a 404.
    """

    cohortId: str
    totalTrainees: int = Field(
        ge=0,
        description=(
            "Distinct trainee ids among scored encounters. Anonymous encounters "
            "(no traineeId) group under the sentinel '(anonymous)' and count once."
        ),
    )
    totalEncounters: int = Field(ge=0)
    underTriageRate: float = Field(ge=0.0, le=1.0)
    overTriageRate: float = Field(ge=0.0, le=1.0)
    correctRate: float = Field(ge=0.0, le=1.0)
    meanLevelsOffAbs: float = Field(ge=0.0)
    byDifficulty: ByDifficulty | None = Field(
        default=None,
        description=(
            "Cohort-wide under-triage segmented by case difficulty. None when there "
            "are no scored encounters or the producer didn't resolve difficulty "
            "(legacy path); populated only by callers that pass a difficulty map."
        ),
    )
    trainees: list[CohortTraineeRow] = Field(
        default_factory=list,
        description=(
            "Per-trainee breakdown, sorted by underTriageRate desc then traineeId "
            "asc (struggling trainees first)."
        ),
    )
