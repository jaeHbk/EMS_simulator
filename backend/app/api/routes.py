"""REST routes for the ED Triage Trainer.

The router carries no path prefix of its own; ``app.main`` mounts it under BOTH
``/api`` (the unversioned back-compat alias the current frontend calls) and
``/api/v1`` (the versioned path). Every route below uses a relative path
(``/encounters``, ``/analytics/{id}``, ...) so it is reachable under either mount.

Each route is a thin adapter:

1. Validate the incoming JSON with a small Pydantic request body.
2. Call the owning module(s) — ``data`` to pick a case, ``sim`` for every state
   transition, ``scoring`` for the deterministic numbers, ``llm`` for the
   narrative, ``store`` for persistence.
3. Return the resulting :class:`~app.models.Encounter` (the single wire format).

Routes never implement clinical, scoring, or state-machine logic themselves and
never read ``case.expert`` directly — expert labels reach the client only via the
``ScoreReport`` attached at the FEEDBACK stage (the ``/feedback`` route).

Domain errors are mapped to clean HTTP status codes:

* ``KeyError``                          -> 404 (unknown encounter / case id)
* ``StageError``                        -> 409 (illegal stage transition / action)
* ``ValueError`` (incl. data errors)    -> 400 (bad request input)

Case selection is random-but-seedable: the request may force a specific case via
``caseId`` or pin the RNG via ``seed`` so an offline demo / test is reproducible.
"""

from __future__ import annotations

import random

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import llm, observability, scoring, sim, store
from app.config import Settings, get_settings
from app.data import registry as data
from app.data.registry import DeidentificationError, UnknownSourceError
from app.models import (
    CohortAnalytics,
    Encounter,
    HistoryTurn,
    Stage,
    TraineeAnalytics,
    TriageCase,
)
from app.models.encounter import Role
from app.models.ops import OperationalStats
from app.scoring.analytics import compute_analytics
from app.scoring.cohort import compute_cohort_analytics
from app.sim.machine import StageError

# Single source of truth for the app version, shared with ``app.main`` (the
# FastAPI ``version=`` and the ``/stats`` payload must agree). Mirror the value in
# ``pyproject.toml`` when bumping the release.
APP_VERSION = "0.1.0"

# No ``prefix`` here: ``app.main`` includes this router under both ``/api`` and
# ``/api/v1`` so every route is reachable at both. Keep all route paths relative.
router = APIRouter(tags=["encounters"])


# ---------------------------------------------------------------------------
# Request bodies (small, strict — the routes' only input contract)
# ---------------------------------------------------------------------------
class _StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateEncounterBody(_StrictBody):
    """Body for ``POST /encounters``.

    All fields optional: with an empty body the server picks a random case from
    its configured default sources.
    """

    sources: list[str] | None = Field(
        default=None,
        description="Source ids to draw the case from; defaults to the configured sources.",
    )
    caseId: str | None = Field(
        default=None,
        description="Force this exact case instead of picking randomly.",
    )
    seed: int | None = Field(
        default=None,
        description="Seed the case-selection RNG for a reproducible pick.",
    )
    traineeId: str | None = Field(
        default=None,
        description=(
            "Opaque per-browser learner id to attach to this encounter for "
            "progress analytics. Not an identity or credential."
        ),
    )
    cohortId: str | None = Field(
        default=None,
        description=(
            "Opaque cohort code to attach to this encounter for an instructor's "
            "aggregate view. Not an identity or credential."
        ),
    )


class AdvanceBody(_StrictBody):
    to: Stage = Field(description="Target stage; must be a legal forward transition.")


class HistoryBody(_StrictBody):
    text: str = Field(
        max_length=2000,
        description="The trainee's message to the patient persona.",
    )


class VitalsBody(_StrictBody):
    fields: list[str] = Field(
        default_factory=list,
        description="Names of vitals fields to measure (revealed from ground truth).",
    )


class EsiBody(_StrictBody):
    esi: int = Field(ge=1, le=5, description="The trainee's ESI decision, 1-5.")


class InterventionsBody(_StrictBody):
    items: list[str] = Field(
        default_factory=list,
        description="Critical interventions the trainee ordered.",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_encounter(encounter_id: str) -> Encounter:
    """Load an encounter or raise a clean 404."""
    try:
        return store.get_encounter(encounter_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"Encounter {encounter_id!r} not found."
        ) from exc


def _pick_case(body: CreateEncounterBody, settings: Settings) -> TriageCase:
    """Select the TriageCase for a new encounter.

    Forcing ``caseId`` wins; otherwise pick random-but-seedable from the requested
    (or configured default) sources. Data-layer errors become clean 4xx.
    """
    if body.caseId is not None:
        try:
            return data.get_case(body.caseId)
        except KeyError as exc:
            raise HTTPException(
                status_code=404, detail=f"Case {body.caseId!r} not found."
            ) from exc

    sources = body.sources if body.sources is not None else settings.enabled_source_list
    try:
        cases = data.load_cases(sources)
    except (UnknownSourceError, DeidentificationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not cases:
        raise HTTPException(
            status_code=404,
            detail=(
                "No cases available for the requested sources "
                f"{sources!r}. Check ENABLED_SOURCES / bundled data."
            ),
        )

    rng = random.Random(body.seed)
    return rng.choice(cases)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/encounters", response_model=Encounter)
def create_encounter(body: CreateEncounterBody | None = None) -> Encounter:
    """Pick a case, create a fresh encounter at CASE_LOAD, persist, and return it.

    An optional ``traineeId`` (opaque per-browser analytics key — not identity)
    is attached so the encounter can later be aggregated into that trainee's
    learning-curve analytics. An optional ``cohortId`` (opaque grouping code —
    not identity) is attached so the encounter can later be aggregated into an
    instructor's cohort view.
    """
    settings = get_settings()
    create_body = body or CreateEncounterBody()
    case = _pick_case(create_body, settings)
    encounter = sim.create_encounter(
        case, trainee_id=create_body.traineeId, cohort_id=create_body.cohortId
    )
    store.save_encounter(encounter)
    return encounter


@router.get("/encounters/{encounter_id}", response_model=Encounter)
def get_encounter(encounter_id: str) -> Encounter:
    """Return the current state of an encounter."""
    return _load_encounter(encounter_id)


@router.post("/encounters/{encounter_id}/advance", response_model=Encounter)
def advance_encounter(encounter_id: str, body: AdvanceBody) -> Encounter:
    """Advance the encounter forward to ``body.to`` (forward-only, server-enforced)."""
    encounter = _load_encounter(encounter_id)
    try:
        updated = sim.advance(encounter, body.to)
    except StageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    store.save_encounter(updated)
    return updated


@router.post("/encounters/{encounter_id}/history", response_model=Encounter)
async def post_history(encounter_id: str, body: HistoryBody) -> Encounter:
    """Append the trainee turn, get the LLM patient reply, append it, persist."""
    encounter = _load_encounter(encounter_id)
    settings = get_settings()

    # The case carries the hidden history the patient persona answers from. It is
    # loaded server-side only and never serialized onto the encounter.
    try:
        case = data.get_case(encounter.caseId)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"Case {encounter.caseId!r} for this encounter not found."
        ) from exc

    # Cap conversation length per encounter (cost / abuse guard) before any work.
    if len(encounter.history) >= settings.llm_max_history_turns:
        raise HTTPException(
            status_code=400, detail="History turn limit reached for this encounter."
        )

    # Record the trainee's turn first (sim enforces this is legal only in HISTORY).
    try:
        after_trainee = sim.record_history_turn(
            encounter, HistoryTurn(role=Role.trainee, text=body.text)
        )
    except StageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    provider = llm.get_provider(settings)
    reply = await llm.patient_reply(case, after_trainee.history, body.text, provider)

    updated = sim.record_history_turn(after_trainee, HistoryTurn(role=Role.patient, text=reply))
    store.save_encounter(updated)
    return updated


@router.post("/encounters/{encounter_id}/vitals", response_model=Encounter)
def post_vitals(encounter_id: str, body: VitalsBody) -> Encounter:
    """Reveal the requested ground-truth vitals fields onto the encounter."""
    encounter = _load_encounter(encounter_id)
    try:
        case = data.get_case(encounter.caseId)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"Case {encounter.caseId!r} for this encounter not found."
        ) from exc

    try:
        updated = sim.measure_vitals(encounter, case, body.fields)
    except StageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    store.save_encounter(updated)
    return updated


@router.post("/encounters/{encounter_id}/esi", response_model=Encounter)
def post_esi(encounter_id: str, body: EsiBody) -> Encounter:
    """Record the trainee's ESI decision (no feedback yet)."""
    encounter = _load_encounter(encounter_id)
    try:
        updated = sim.assign_esi(encounter, body.esi)
    except StageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    store.save_encounter(updated)
    return updated


@router.post("/encounters/{encounter_id}/interventions", response_model=Encounter)
def post_interventions(encounter_id: str, body: InterventionsBody) -> Encounter:
    """Record the critical interventions the trainee ordered."""
    encounter = _load_encounter(encounter_id)
    try:
        updated = sim.order_interventions(encounter, body.items)
    except StageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    store.save_encounter(updated)
    return updated


@router.post("/encounters/{encounter_id}/feedback", response_model=Encounter)
async def post_feedback(encounter_id: str) -> Encounter:
    """Advance to FEEDBACK, score deterministically, then fill the LLM narrative.

    This is the only route that reveals expert labels — and only via the
    ``ScoreReport`` produced by the deterministic scoring engine. The LLM authors
    ``narrative`` from those already-computed numbers; it never produces a score.
    """
    encounter = _load_encounter(encounter_id)
    settings = get_settings()

    try:
        case = data.get_case(encounter.caseId)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"Case {encounter.caseId!r} for this encounter not found."
        ) from exc

    # Move the state machine to FEEDBACK (forward-only; illegal jumps -> 409).
    try:
        completed = sim.advance(encounter, Stage.FEEDBACK)
    except StageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # Deterministic numbers first; the engine leaves narrative == "".
    report = scoring.score(completed, case)

    # Then the LLM fills only the narrative, grounded in those numbers.
    provider = llm.get_provider(settings)
    report.narrative = await llm.feedback_narrative(report, case, provider)

    completed.scoreReport = report
    store.save_encounter(completed)
    return completed


@router.get("/analytics/{trainee_id}", response_model=TraineeAnalytics)
def get_trainee_analytics(trainee_id: str) -> TraineeAnalytics:
    """Per-trainee learning-curve metrics, computed deterministically from stored
    ScoreReports.

    ``trainee_id`` is an OPAQUE per-browser analytics key, not an identity or
    credential. An unknown/empty trainee returns a zeroed report (not a 404).
    Expert ESI appears here legitimately: every contributing encounter is at the
    FEEDBACK stage, where expert labels are already revealed via scoring.
    """
    encounters = store.list_encounters_by_trainee(trainee_id)
    # Resolve each distinct case's difficulty so analytics can segment under-triage
    # into trap vs standard buckets. An unknown/evicted case (KeyError) is treated
    # as None (-> standard by compute_analytics); we never 500 the analytics read.
    difficulty_by_case: dict[str, str | None] = {}
    for case_id in {enc.caseId for enc in encounters}:
        try:
            difficulty = data.get_case(case_id).difficulty
        except KeyError:
            difficulty = None
        difficulty_by_case[case_id] = difficulty.value if difficulty is not None else None
    return compute_analytics(trainee_id, encounters, difficulty_by_case)


@router.get("/cohort/{cohort_id}/analytics", response_model=CohortAnalytics)
def get_cohort_analytics(cohort_id: str) -> CohortAnalytics:
    """Cohort-level triage analytics for an instructor, computed deterministically
    from stored ScoreReports.

    ``cohort_id`` (and the per-trainee ids in the breakdown) are OPAQUE
    grouping/analytics keys, not identities or credentials; the report carries
    aggregates and opaque codes only — no PII, no per-encounter content beyond
    counts/rates. Every contributing encounter is at the FEEDBACK stage, where
    expert labels are already revealed via scoring, so expert ESI here is fine. An
    unknown/empty cohort returns a zeroed report (not a 404).
    """
    encounters = store.list_encounters_by_cohort(cohort_id)
    # Resolve each distinct case's difficulty so cohort analytics can segment
    # under-triage into trap vs standard buckets. An unknown/evicted case (KeyError)
    # is treated as None (-> standard); we never 500 the analytics read.
    difficulty_by_case: dict[str, str | None] = {}
    for case_id in {enc.caseId for enc in encounters}:
        try:
            difficulty = data.get_case(case_id).difficulty
        except KeyError:
            difficulty = None
        difficulty_by_case[case_id] = difficulty.value if difficulty is not None else None
    return compute_cohort_analytics(cohort_id, encounters, difficulty_by_case)


@router.get("/stats", response_model=OperationalStats, tags=["meta"])
def get_stats() -> OperationalStats:
    """Operational/monitoring summary for deploy + observability visibility.

    Aggregates only: the stored-encounter count and the in-process LLM metrics
    snapshot (call/failure counts, latency, char throughput), plus the app
    version. This is for ops dashboards / readiness checks — it is NOT part of
    the trainee (React) contract and is intentionally absent from
    ``shared/schemas`` and ``contract.ts``. It exposes NO PII and NO per-encounter
    content (no ids, history, or expert labels) — counts and aggregate metrics
    only.
    """
    return OperationalStats(
        encounters=store.count_encounters(),
        llm=observability.snapshot(),
        version=APP_VERSION,
    )
