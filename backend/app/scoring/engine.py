"""Deterministic scoring engine for the ED Triage Trainer.

`score(enc, case)` grades one completed encounter against the case's expert
labels and (when present) real outcome, returning a fully populated
`ScoreReport` with `narrative == ""`. Every number is rule-based and
deterministic: the same `(Encounter, TriageCase)` inputs always yield the same
report. The LLM never touches a number here.

The headline result is `EsiResult.triageDirection`. Under-triage — assigning a
*less* acute (numerically higher) ESI than the expert — is the safety failure
this tool exists to reduce, so it is penalized strictly harder than the
symmetric over-triage at every magnitude (see `_esi_subscore`).

Scoring is a weighted sum of competency dimensions, each scored in [0, 1]:

    ESI_ACCURACY              0.40   (top weight; under-triage penalized harder)
    HISTORY_COMPLETENESS      0.20   (red flags surfaced in the transcript)
    VITALS_ACQUISITION        0.10   (expected vitals the trainee measured)
    INTERVENTION_RECOGNITION  0.15   (F1 overlap with expert critical actions)
    OUTCOME_ALIGNMENT         0.15   (ESI/disposition consistency; 0 if no outcome)

When the case has no real outcome (`case.outcome is None`), OUTCOME_ALIGNMENT
gets weight 0 and is *excluded* from normalization; the remaining weights are
renormalized to sum to 1.0. `overallPercent` is the weighted sum of dimension
scores by their normalized weights, times 100, rounded to one decimal place.
"""

from __future__ import annotations

import re

from app.models import (
    CriticalIntervention,
    Encounter,
    ScoreDimension,
    ScoreReport,
    TriageCase,
    TriageDirection,
    Vitals,
)
from app.models.encounter import Role
from app.models.score import DimensionKey, EsiResult
from app.models.triage_case import Disposition
from app.scoring.esi_algorithm import EsiDecision, esi_decision

# ---------------------------------------------------------------------------
# Default dimension weights. Tests pin these exact values, so do not change one
# without updating the golden vectors in backend/tests/test_scoring.py.
# ---------------------------------------------------------------------------
DEFAULT_WEIGHTS: dict[DimensionKey, float] = {
    DimensionKey.ESI_ACCURACY: 0.40,
    DimensionKey.HISTORY_COMPLETENESS: 0.20,
    DimensionKey.VITALS_ACQUISITION: 0.10,
    DimensionKey.INTERVENTION_RECOGNITION: 0.15,
    DimensionKey.OUTCOME_ALIGNMENT: 0.15,
}

DIMENSION_LABELS: dict[DimensionKey, str] = {
    DimensionKey.ESI_ACCURACY: "ESI Accuracy",
    DimensionKey.HISTORY_COMPLETENESS: "History Completeness",
    DimensionKey.VITALS_ACQUISITION: "Vitals Acquisition",
    DimensionKey.INTERVENTION_RECOGNITION: "Intervention Recognition",
    DimensionKey.OUTCOME_ALIGNMENT: "Outcome Alignment",
}

# The ordered vitals fields on the Vitals model. Used to compute "expected" vs
# "measured" sets without relying on dict ordering of model fields.
_VITALS_FIELDS: tuple[str, ...] = (
    "heartRate",
    "systolicBP",
    "diastolicBP",
    "respiratoryRate",
    "spo2",
    "temperatureC",
    "painScore",
    "glucose",
    "avpu",
)

# Words too generic to be diagnostic of a red flag; ignored when matching a red
# flag against the trainee's history transcript so that, e.g., the red flag
# "chest pain radiating to the arm" is not matched merely because the trainee
# said "the". Kept deliberately small and deterministic.
_STOPWORDS: frozenset[str] = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "has",
        "have",
        "in",
        "is",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
        "without",
    }
)

# Dispositions that signify a genuinely high-acuity outcome (the patient needed
# admission / critical care / surgery / died). Used by OUTCOME_ALIGNMENT.
_HIGH_ACUITY_DISPOSITIONS: frozenset[Disposition] = frozenset(
    {Disposition.ADMIT, Disposition.ICU, Disposition.OR, Disposition.EXPIRED}
)
# Dispositions that signify a low-acuity outcome (the patient went home / left).
_LOW_ACUITY_DISPOSITIONS: frozenset[Disposition] = frozenset(
    {Disposition.DISCHARGE, Disposition.LWBS}
)


# ---------------------------------------------------------------------------
# ESI accuracy
# ---------------------------------------------------------------------------
def _esi_subscore(levels_off: int) -> float:
    """Map ``levelsOff`` (= assigned - expert) to a sub-score in [0, 1].

    Under-triage (positive ``levels_off`` — a less-acute / higher ESI number
    than the expert) is penalized strictly harder than the symmetric
    over-triage at the same magnitude:

        0   exact                       -> 1.0
        -1  over-triage by 1            -> 0.6
        +1  under-triage by 1           -> 0.3   (< 0.6: harder than OVER)
        <=-2 over-triage by 2 or more   -> 0.2
        >=+2 under-triage by 2 or more  -> 0.0   (< 0.2: harder than OVER)
    """
    if levels_off == 0:
        return 1.0
    if levels_off == -1:  # over-triage by 1 (more acute than needed)
        return 0.6
    if levels_off == 1:  # under-triage by 1 (less acute — dangerous)
        return 0.3
    if levels_off <= -2:  # over-triage by >= 2
        return 0.2
    # levels_off >= 2: under-triage by >= 2 (most dangerous)
    return 0.0


def _build_esi_result(enc: Encounter, case: TriageCase) -> EsiResult:
    """Build the headline ESI result.

    ``enc.esiAssigned`` may be ``None`` if the trainee never submitted an ESI.
    A missing decision is NEVER credited as correct, even when the least-acute
    sentinel happens to equal the expert level (e.g. an expert ESI-5 case): a
    triage with no acuity decision is a failure to prioritize, which we report as
    under-triage. The sentinel ``assigned = 5`` (least acute) is used only to
    satisfy the wire contract (``assigned`` must be 1..5); the no-credit scoring
    is enforced in ``_esi_dimension`` via the ``decided`` flag. The API also
    rejects a feedback request with no ESI, so this is a defensive path.
    """
    expert = case.expert.esi
    if enc.esiAssigned is None:
        return EsiResult(
            assigned=5,
            expert=expert,
            correct=False,
            triageDirection=TriageDirection.UNDER_TRIAGE,
            levelsOff=5 - expert,
        )

    assigned = enc.esiAssigned
    levels_off = assigned - expert
    if levels_off == 0:
        direction = TriageDirection.CORRECT
    elif levels_off < 0:
        # assigned a more-acute (lower) number than expert
        direction = TriageDirection.OVER_TRIAGE
    else:
        # assigned a less-acute (higher) number than expert — under-triage
        direction = TriageDirection.UNDER_TRIAGE
    return EsiResult(
        assigned=assigned,
        expert=expert,
        correct=(levels_off == 0),
        triageDirection=direction,
        levelsOff=levels_off,
    )


def _expert_esi_decision(case: TriageCase) -> EsiDecision:
    """Run the cited ESI v4 decision tree on the case's expert labels.

    This is a *teaching* layer only: it names the decision point the expert ESI
    flows through (steps A->D) so feedback can point the trainee at exactly which
    decision they got wrong. It never changes a score — ``case.expert.esi`` stays
    the authoritative scoring target.
    """
    gt = case.presentation.groundTruthVitals
    return esi_decision(
        life_saving=case.expert.requiresLifeSaving,
        high_risk=case.expert.isHighRisk,
        resources_predicted=case.expert.resourcesPredicted,
        vitals={
            "heartRate": gt.heartRate,
            "respiratoryRate": gt.respiratoryRate,
            "spo2": gt.spo2,
        },
        age_band=case.demographics.ageBand,
    )


def _esi_dimension(esi: EsiResult, decided: bool, case: TriageCase) -> ScoreDimension:
    if not decided:
        # No ESI was assigned. Award zero on the top-weighted dimension: a triage
        # with no acuity decision must never be credited (in particular it must
        # not read as correct when the sentinel 5 matches an expert ESI-5 case).
        return ScoreDimension(
            key=DimensionKey.ESI_ACCURACY,
            label=DIMENSION_LABELS[DimensionKey.ESI_ACCURACY],
            score=0.0,
            weight=DEFAULT_WEIGHTS[DimensionKey.ESI_ACCURACY],
            detail=(
                "No ESI level was assigned. A triage with no acuity decision is "
                "scored as a failure to prioritize and receives no credit."
            ),
        )
    sub = _esi_subscore(esi.levelsOff)
    if esi.correct:
        detail = f"Assigned ESI {esi.assigned} matches the expert ESI {esi.expert}."
    elif esi.triageDirection is TriageDirection.UNDER_TRIAGE:
        detail = (
            f"Under-triage: assigned ESI {esi.assigned} is less acute than the "
            f"expert ESI {esi.expert} ({esi.levelsOff} level(s) too low in acuity). "
            "Under-triage is the dangerous error and is penalized most heavily."
        )
    else:  # OVER_TRIAGE
        detail = (
            f"Over-triage: assigned ESI {esi.assigned} is more acute than the "
            f"expert ESI {esi.expert} ({abs(esi.levelsOff)} level(s) too high in acuity)."
        )
    # Teaching layer: name the cited ESI v4 decision point the expert level flows
    # through (steps A->D), so feedback points the trainee at the decision they
    # missed. This enriches free-text only; it does not change the score above.
    decision = _expert_esi_decision(case)
    path_str = " -> ".join(decision.path)
    detail = f"Expert ESI {esi.expert} via cited ESI v4 algorithm: {path_str}. {detail}"
    return ScoreDimension(
        key=DimensionKey.ESI_ACCURACY,
        label=DIMENSION_LABELS[DimensionKey.ESI_ACCURACY],
        score=sub,
        weight=DEFAULT_WEIGHTS[DimensionKey.ESI_ACCURACY],
        detail=detail,
    )


# ---------------------------------------------------------------------------
# History completeness (red flags surfaced in the transcript)
# ---------------------------------------------------------------------------
def _salient_words(red_flag: str) -> list[str]:
    """Extract the salient (non-stopword) lowercase tokens of a red flag."""
    tokens = re.findall(r"[a-z0-9]+", red_flag.lower())
    return [t for t in tokens if t not in _STOPWORDS]


def _transcript_tokens(enc: Encounter) -> set[str]:
    """The set of lowercase word tokens across every trainee history turn.

    Tokenized the same way as :func:`_salient_words` so red-flag matching is at
    word boundaries, not bare substring containment (otherwise "arm" would match
    "warm" and "syncope" would match "presyncope").
    """
    text = " ".join(turn.text for turn in enc.history if turn.role is Role.trainee).lower()
    return set(re.findall(r"[a-z0-9]+", text))


def _red_flag_surfaced(red_flag: str, transcript_tokens: set[str]) -> bool:
    """A red flag is surfaced if ALL its salient words appear as whole tokens in
    the trainee's history transcript.

    Requiring all salient words keeps detection deterministic and conservative:
    merely mentioning a common word does not count a multi-word red flag as
    surfaced. Matching is whole-token (word boundary), so a short salient word
    like "arm" is not surfaced by "warm". A red flag with no salient words (all
    stopwords / empty) is treated as not surfaceable and therefore never matched.
    """
    words = _salient_words(red_flag)
    if not words:
        return False
    return all(word in transcript_tokens for word in words)


def _history_dimension(enc: Encounter, case: TriageCase) -> tuple[ScoreDimension, list[str]]:
    """Score history completeness and return the missed red flags."""
    red_flags = case.presentation.history.redFlags
    if not red_flags:
        dim = ScoreDimension(
            key=DimensionKey.HISTORY_COMPLETENESS,
            label=DIMENSION_LABELS[DimensionKey.HISTORY_COMPLETENESS],
            score=1.0,
            weight=DEFAULT_WEIGHTS[DimensionKey.HISTORY_COMPLETENESS],
            detail="No red flags defined for this case; history completeness is full credit.",
        )
        return dim, []

    transcript_tokens = _transcript_tokens(enc)
    surfaced: list[str] = []
    missed: list[str] = []
    for flag in red_flags:
        if _red_flag_surfaced(flag, transcript_tokens):
            surfaced.append(flag)
        else:
            missed.append(flag)

    score_val = len(surfaced) / len(red_flags)
    if missed:
        detail = (
            f"Surfaced {len(surfaced)} of {len(red_flags)} red flags. "
            f"Missed: {', '.join(missed)}."
        )
    else:
        detail = f"Surfaced all {len(red_flags)} red flags."
    dim = ScoreDimension(
        key=DimensionKey.HISTORY_COMPLETENESS,
        label=DIMENSION_LABELS[DimensionKey.HISTORY_COMPLETENESS],
        score=score_val,
        weight=DEFAULT_WEIGHTS[DimensionKey.HISTORY_COMPLETENESS],
        detail=detail,
    )
    return dim, missed


# ---------------------------------------------------------------------------
# Vitals acquisition
# ---------------------------------------------------------------------------
def _measured_fields(vitals: Vitals) -> set[str]:
    """The set of vitals fields with a non-null value."""
    return {f for f in _VITALS_FIELDS if getattr(vitals, f) is not None}


def _vitals_dimension(enc: Encounter, case: TriageCase) -> ScoreDimension:
    """Fraction of clinically-expected vitals the trainee measured.

    Expected = vitals that are non-null in ``case.presentation.groundTruthVitals``.
    Score = |measured ∩ expected| / |expected| (1.0 when nothing is expected).
    Measuring extra vitals beyond the expected set does not lower the score.
    """
    expected = _measured_fields(case.presentation.groundTruthVitals)
    if not expected:
        return ScoreDimension(
            key=DimensionKey.VITALS_ACQUISITION,
            label=DIMENSION_LABELS[DimensionKey.VITALS_ACQUISITION],
            score=1.0,
            weight=DEFAULT_WEIGHTS[DimensionKey.VITALS_ACQUISITION],
            detail="No vitals expected for this case; vitals acquisition is full credit.",
        )
    measured = _measured_fields(enc.measuredVitals)
    acquired = measured & expected
    score_val = len(acquired) / len(expected)
    missed = sorted(expected - measured)
    if missed:
        detail = (
            f"Measured {len(acquired)} of {len(expected)} expected vitals. "
            f"Missed: {', '.join(missed)}."
        )
    else:
        detail = f"Measured all {len(expected)} expected vitals."
    return ScoreDimension(
        key=DimensionKey.VITALS_ACQUISITION,
        label=DIMENSION_LABELS[DimensionKey.VITALS_ACQUISITION],
        score=score_val,
        weight=DEFAULT_WEIGHTS[DimensionKey.VITALS_ACQUISITION],
        detail=detail,
    )


# ---------------------------------------------------------------------------
# Intervention recognition (F1-style overlap)
# ---------------------------------------------------------------------------
def _normalize_interventions(items: list[str]) -> set[str]:
    """Normalize free-text intervention strings to comparable upper-case tokens.

    The trainee's ``interventionsOrdered`` is a free ``list[str]`` while the
    expert list is the ``CriticalIntervention`` enum. We compare on upper-cased,
    whitespace-trimmed strings so that e.g. "iv_access" matches the enum value
    ``IV_ACCESS``. The sentinel ``NONE`` is handled by the caller; here it is
    just another token, and blank entries are dropped.
    """
    out: set[str] = set()
    for raw in items:
        token = raw.strip().upper()
        if token:
            out.add(token)
    return out


def _interventions_dimension(enc: Encounter, case: TriageCase) -> ScoreDimension:
    """F1 overlap between trainee orders and the expert's critical interventions.

    Semantics:
      * Expert ``[NONE]`` (or empty) means "no interventions expected". If the
        trainee also ordered nothing (or only ``NONE``), score 1.0. Any real
        intervention the trainee orders here is a false positive and lowers the
        score via precision (F1).
      * Otherwise score = F1 = 2*|TP| / (2*|TP| + |FP| + |FN|) over the sets of
        intervention tokens, where TP = ordered ∩ expected, FP = ordered \\
        expected, FN = expected \\ ordered. The ``NONE`` sentinel is stripped
        from the trainee's orders before comparison so "ordered NONE" reads as
        "ordered nothing".
    """
    expert_set = {ci.value for ci in case.expert.criticalInterventions}
    # Treat an explicit [NONE] (or empty) expert list as "no interventions".
    expert_real = expert_set - {CriticalIntervention.NONE.value}
    expert_expects_none = len(expert_real) == 0

    ordered = _normalize_interventions(enc.interventionsOrdered)
    ordered_real = ordered - {CriticalIntervention.NONE.value}

    if expert_expects_none:
        if not ordered_real:
            score_val = 1.0
            detail = "No critical interventions were expected and none were ordered."
        else:
            # All ordered items are false positives. Penalize via precision:
            # F1 with TP=0 is 0, but we report the precision-style number so the
            # score degrades with the count of unnecessary orders.
            fp = len(ordered_real)
            score_val = 0.0  # 2*0 / (2*0 + fp + 0)
            detail = (
                f"No critical interventions were expected, but {fp} were ordered "
                f"({', '.join(sorted(ordered_real))})."
            )
        return ScoreDimension(
            key=DimensionKey.INTERVENTION_RECOGNITION,
            label=DIMENSION_LABELS[DimensionKey.INTERVENTION_RECOGNITION],
            score=score_val,
            weight=DEFAULT_WEIGHTS[DimensionKey.INTERVENTION_RECOGNITION],
            detail=detail,
        )

    tp = len(ordered_real & expert_real)
    fp = len(ordered_real - expert_real)
    fn = len(expert_real - ordered_real)
    denom = 2 * tp + fp + fn
    score_val = (2 * tp) / denom if denom else 1.0

    missed = sorted(expert_real - ordered_real)
    extra = sorted(ordered_real - expert_real)
    parts = [f"Matched {tp} of {len(expert_real)} expected interventions."]
    if missed:
        parts.append(f"Missed: {', '.join(missed)}.")
    if extra:
        parts.append(f"Unnecessary: {', '.join(extra)}.")
    return ScoreDimension(
        key=DimensionKey.INTERVENTION_RECOGNITION,
        label=DIMENSION_LABELS[DimensionKey.INTERVENTION_RECOGNITION],
        score=score_val,
        weight=DEFAULT_WEIGHTS[DimensionKey.INTERVENTION_RECOGNITION],
        detail=" ".join(parts),
    )


# ---------------------------------------------------------------------------
# Outcome alignment
# ---------------------------------------------------------------------------
def _outcome_dimension(enc: Encounter, case: TriageCase, esi: EsiResult) -> ScoreDimension | None:
    """Reward consistency between the assigned ESI and the real disposition.

    Returns ``None`` when the case has no outcome OR no disposition — in that
    case the dimension is omitted entirely (weight 0) and excluded from
    normalization (handled by the caller).

    Heuristic (deterministic):
      * High-acuity disposition (ADMIT / ICU / OR / EXPIRED): the patient truly
        needed aggressive care, so an acute assigned ESI (1-2) is consistent
        (score 1.0); a mid ESI (3) is partially consistent (0.5); a low / least
        acute ESI (4-5) is inconsistent with a sick patient (0.0).
      * Low-acuity disposition (DISCHARGE / LWBS): the patient went home, so a
        low-acuity assigned ESI (4-5) is consistent (1.0); ESI 3 is partial
        (0.5); an acute ESI (1-2) is over-cautious relative to the outcome
        (0.5 — not zero, since erring toward caution is clinically defensible).
      * Other dispositions (TRANSFER / UNKNOWN): not a clear acuity signal;
        give neutral credit (0.5).

    The assigned ESI is used (not the expert ESI) because this dimension grades
    the trainee's decision against the real-world outcome.
    """
    if case.outcome is None or case.outcome.disposition is None:
        return None

    disposition = case.outcome.disposition
    assigned = esi.assigned

    if disposition in _HIGH_ACUITY_DISPOSITIONS:
        if assigned <= 2:
            score_val = 1.0
        elif assigned == 3:
            score_val = 0.5
        else:
            score_val = 0.0
        detail = (
            f"Real disposition was {disposition.value} (high acuity); assigned "
            f"ESI {assigned} is "
            + ("consistent." if score_val == 1.0 else "inconsistent with a sick patient.")
        )
    elif disposition in _LOW_ACUITY_DISPOSITIONS:
        if assigned >= 4:
            score_val = 1.0
        elif assigned == 3:
            score_val = 0.5
        else:
            score_val = 0.5
        detail = (
            f"Real disposition was {disposition.value} (low acuity); assigned "
            f"ESI {assigned} alignment scored {score_val}."
        )
    else:
        score_val = 0.5
        detail = (
            f"Real disposition was {disposition.value}, which is not a clear "
            f"acuity signal; neutral alignment credit."
        )

    return ScoreDimension(
        key=DimensionKey.OUTCOME_ALIGNMENT,
        label=DIMENSION_LABELS[DimensionKey.OUTCOME_ALIGNMENT],
        score=score_val,
        weight=DEFAULT_WEIGHTS[DimensionKey.OUTCOME_ALIGNMENT],
        detail=detail,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def score(enc: Encounter, case: TriageCase) -> ScoreReport:
    """Grade a completed encounter deterministically.

    Returns a fully populated ``ScoreReport`` with ``narrative == ""``; the API
    layer fills the narrative later via ``app/llm/feedback.py``. The dimension
    weights stored on the report are the *normalized* weights actually used to
    compute ``overallPercent`` (so they sum to 1.0 across the included
    dimensions), making the report self-explanatory.
    """
    esi = _build_esi_result(enc, case)

    esi_dim = _esi_dimension(esi, decided=enc.esiAssigned is not None, case=case)
    history_dim, missed_red_flags = _history_dimension(enc, case)
    vitals_dim = _vitals_dimension(enc, case)
    interventions_dim = _interventions_dimension(enc, case)
    outcome_dim = _outcome_dimension(enc, case, esi)

    # Assemble in a fixed, stable order. OUTCOME_ALIGNMENT is omitted when there
    # is no outcome to align against.
    dimensions: list[ScoreDimension] = [esi_dim, history_dim, vitals_dim, interventions_dim]
    if outcome_dim is not None:
        dimensions.append(outcome_dim)

    # Renormalize weights across the included dimensions so they sum to 1.0.
    raw_weight_total = sum(d.weight for d in dimensions)
    overall = 0.0
    if raw_weight_total > 0:
        for dim in dimensions:
            normalized_weight = dim.weight / raw_weight_total
            dim.weight = normalized_weight
            overall += dim.score * normalized_weight

    overall_percent = round(overall * 100, 1)
    # Clamp into the schema's [0, 100] bound against any float rounding noise.
    overall_percent = max(0.0, min(100.0, overall_percent))

    return ScoreReport(
        encounterId=enc.encounterId,
        esi=esi,
        dimensions=dimensions,
        overallPercent=overall_percent,
        narrative="",
        missedRedFlags=missed_red_flags,
    )
