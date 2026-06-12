"""Analytics models — mirrors shared/schemas/analytics.schema.json.

Per-trainee learning-curve metrics, computed deterministically from stored
ScoreReports by app/scoring/analytics.py. The trainee id is an OPAQUE
per-browser analytics key — NOT an identity or credential. These numbers are
rule-based; no LLM is involved.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.score import TriageDirection


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AnalyticsPoint(_Strict):
    """One scored encounter's contribution to a trainee's learning curve."""

    encounterId: str
    startedAt: datetime | None = None
    triageDirection: TriageDirection
    esiAssigned: int | None = Field(default=None, ge=1, le=5)
    esiExpert: int = Field(ge=1, le=5)
    overallPercent: float = Field(ge=0.0, le=100.0)


class DifficultyStats(_Strict):
    """Under-triage summary for one difficulty bucket (trap or standard)."""

    totalEncounters: int = Field(ge=0)
    underTriageRate: float = Field(
        ge=0.0,
        le=1.0,
        description="Fraction UNDER_TRIAGE in this bucket; 0.0 when the bucket is empty.",
    )


class ByDifficulty(_Strict):
    """Under-triage segmented by case difficulty.

    ``trap`` buckets cases tagged TRAP (benign-looking but dangerous); ``standard``
    buckets STANDARD or untagged cases (None is treated as STANDARD).
    """

    trap: DifficultyStats
    standard: DifficultyStats


class TraineeAnalytics(_Strict):
    """Per-trainee learning-curve summary. An unknown trainee yields a zeroed
    report (totalEncounters == 0, all rates 0.0, empty history), never a 404.
    """

    traineeId: str
    totalEncounters: int = Field(ge=0)
    underTriageRate: float = Field(ge=0.0, le=1.0)
    overTriageRate: float = Field(ge=0.0, le=1.0)
    correctRate: float = Field(ge=0.0, le=1.0)
    meanLevelsOffAbs: float = Field(ge=0.0)
    byDifficulty: ByDifficulty | None = Field(
        default=None,
        description=(
            "Under-triage segmented by case difficulty. None when there are no "
            "scored encounters or the producer didn't resolve difficulty (legacy "
            "path); populated only by callers that pass a difficulty map."
        ),
    )
    history: list[AnalyticsPoint] = Field(default_factory=list)
