"""Pydantic models mirroring shared/schemas/*.json field-for-field.

These are the Python embodiment of the cross-language contract. If you change a
field here, change the JSON Schema and the TypeScript type to match, and keep
tests/test_contract.py green.
"""

from app.models.analytics import AnalyticsPoint, TraineeAnalytics
from app.models.encounter import Encounter, HistoryTurn, Stage
from app.models.score import ScoreDimension, ScoreReport, TriageDirection
from app.models.triage_case import (
    CriticalIntervention,
    Demographics,
    Difficulty,
    Disposition,
    ExpertLabels,
    Outcome,
    Presentation,
    Provenance,
    TriageCase,
    Vitals,
)

__all__ = [
    "AnalyticsPoint",
    "CriticalIntervention",
    "Demographics",
    "Difficulty",
    "Disposition",
    "Encounter",
    "ExpertLabels",
    "HistoryTurn",
    "Outcome",
    "Presentation",
    "Provenance",
    "ScoreDimension",
    "ScoreReport",
    "Stage",
    "TraineeAnalytics",
    "TriageCase",
    "TriageDirection",
    "Vitals",
]
