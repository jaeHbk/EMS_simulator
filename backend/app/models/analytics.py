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
    history: list[AnalyticsPoint] = Field(default_factory=list)
