"""Cited Emergency Severity Index (ESI) version 4 decision-tree algorithm.

This module encodes the published four-decision ESI v4 triage algorithm as a
pure, deterministic, dependency-light function. It is a **validation + teaching
layer**: it does NOT award scoring points and does NOT replace the authoritative
``expert.esi`` label on a case. The scoring engine uses it only to *name the
decision point* a trainee missed, and the test-suite uses it to prove that every
authored ``expert.esi`` agrees with the cited algorithm (provenance for
publication).

The algorithm (Gilboy et al., ESI v4 Implementation Handbook, Figure: the ESI
algorithm):

    Decision A  Does the patient require an immediate life-saving intervention?
                -> yes: ESI 1.
    Decision B  Is this a high-risk situation? OR is the patient
                confused/lethargic/disoriented? OR in severe pain/distress?
                -> yes (and not A): ESI 2.
    Decision C  How many different resources will the patient need?
                none -> ESI 5; one -> ESI 4; two or more -> ESI 3.
    Decision D  (Only for patients routed to ESI 3 by Decision C.) Are any
                danger-zone vital signs present? If so, *consider* upgrading to
                ESI 2. We encode the canonical danger-zone vital-sign criteria
                deterministically: if any danger-zone vital is met, upgrade to 2.

Danger-zone vital-sign thresholds (source: Gilboy N, Tanabe P, Travers D,
Rosenau AM. *Emergency Severity Index (ESI): A Triage Tool for Emergency
Department Care, Version 4, Implementation Handbook 2012 Edition*. AHRQ
Publication No. 12-0014. Rockville, MD: Agency for Healthcare Research and
Quality; 2011. — the "Consider" pediatric fever/danger-zone vital signs table
and the adult danger-zone vital sign criteria):

    Adults and children > 12 years (and unknown age):
        HR > 100 bpm,  RR > 20 breaths/min,  SpO2 < 92%.

    Pediatric danger-zone HR/RR vary by age. The handbook's pediatric
    "consider" thresholds are (HR / RR):
        < 3 months:        HR > 180,  RR > 50
        3 months - 3 yr:   HR > 160,  RR > 40
        3 - 5 yr:          HR > 140,  RR > 34
        5 - 12 yr:         HR > 120,  RR > 30
        > 12 yr / adult:   HR > 100,  RR > 20
    SpO2 < 92% is the danger-zone oxygenation trigger at all ages.

Age-band mapping. This app stores de-identified age **bands** (HIPAA Safe
Harbor), e.g. "0-17", "18-24", "25-34", ... or "unknown" — never an exact age.
Adult bands all start at >= 18, so they map to the adult thresholds. The only
pediatric band the data model can produce is "0-17"; because a single band spans
infancy through adolescence we map "0-17" to the **most conservative** (lowest)
pediatric danger thresholds that still differ from adult — the 5-12 yr bucket
(HR > 120, RR > 30) — so a value that is danger-zone for an adult (e.g. HR 110)
is correctly NOT flagged for a child, while a genuinely high pediatric value
(e.g. HR 130) still is. "unknown" is treated as adult (the conservative default
for an adult-dominated ED population). Thresholds are strict (``>`` / ``<``):
a value exactly at the boundary is NOT in the danger zone.

Unknown resources. When ``resources_predicted`` is ``None`` the resource count
needed for Decision C is unknown, so a definitive C-level (5/4/3) cannot be
reached. We treat this conservatively: Decisions A and B are still evaluated
(they do not need a resource count), and if neither fires we default to the
two-or-more-resources branch (ESI 3) and still run Decision D on the vitals.
This never under-triages relative to the available signals: it cannot return 4
or 5 without a resource count proving low acuity.
"""

from __future__ import annotations

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Danger-zone vital-sign thresholds (cited above). Strict comparisons.
# ---------------------------------------------------------------------------
_ADULT_HR_MAX: float = 100.0  # HR > 100 bpm is danger zone
_ADULT_RR_MAX: float = 20.0  # RR > 20 breaths/min is danger zone
_SPO2_MIN: float = 92.0  # SpO2 < 92% is danger zone (all ages)

# Pediatric band "0-17" -> 5-12 yr bucket thresholds (see module docstring).
_PEDS_HR_MAX: float = 120.0
_PEDS_RR_MAX: float = 30.0

_PEDIATRIC_BANDS: frozenset[str] = frozenset({"0-17"})


@dataclass(frozen=True)
class EsiDecision:
    """The result of running the cited ESI v4 decision tree.

    ``level`` is the derived ESI acuity (1 = most acute .. 5 = least acute).
    ``path`` is the ordered list of decision points traversed, each prefixed by
    its letter (e.g. ``"A: no life-saving intervention"``), so feedback can name
    exactly which decision determined the level. ``rationale`` is a one-line
    human summary.
    """

    level: int
    path: list[str]
    rationale: str


def _hr_thresholds(age_band: str | None) -> tuple[float, float]:
    """Return (hr_max, rr_max) danger-zone thresholds for the age band."""
    if age_band in _PEDIATRIC_BANDS:
        return _PEDS_HR_MAX, _PEDS_RR_MAX
    return _ADULT_HR_MAX, _ADULT_RR_MAX


def _danger_zone_vitals(
    vitals: dict[str, float | None] | None, age_band: str | None
) -> list[str]:
    """Return the list of danger-zone vital-sign descriptions that are present.

    Empty means no danger-zone vital is met (or no vitals were supplied).
    Missing individual values (``None``) are simply not evaluated.
    """
    if not vitals:
        return []
    hr_max, rr_max = _hr_thresholds(age_band)
    triggered: list[str] = []

    hr = vitals.get("heartRate")
    if hr is not None and hr > hr_max:
        triggered.append(f"HR {hr:g} > {hr_max:g}")

    rr = vitals.get("respiratoryRate")
    if rr is not None and rr > rr_max:
        triggered.append(f"RR {rr:g} > {rr_max:g}")

    spo2 = vitals.get("spo2")
    if spo2 is not None and spo2 < _SPO2_MIN:
        triggered.append(f"SpO2 {spo2:g} < {_SPO2_MIN:g}")

    return triggered


def danger_zone_fields(
    vitals: dict[str, float | None] | None, age_band: str | None
) -> set[str]:
    """The set of vital FIELD KEYS whose value is in the danger zone.

    Uses the SAME cited ESI v4 thresholds and strict boundary semantics as the
    decision algorithm's :func:`_danger_zone_vitals` (value exactly at the
    threshold is NOT danger zone), but returns the field keys (e.g.
    ``{"heartRate", "spo2"}``) rather than human-readable descriptions, so the
    scoring engine can reward recognizing which measured vitals are dangerous.

    Empty when no vital is in the danger zone or ``vitals`` is ``None``. Missing
    individual values (``None``) are simply not evaluated.
    """
    if not vitals:
        return set()
    hr_max, rr_max = _hr_thresholds(age_band)
    fields: set[str] = set()

    hr = vitals.get("heartRate")
    if hr is not None and hr > hr_max:
        fields.add("heartRate")

    rr = vitals.get("respiratoryRate")
    if rr is not None and rr > rr_max:
        fields.add("respiratoryRate")

    spo2 = vitals.get("spo2")
    if spo2 is not None and spo2 < _SPO2_MIN:
        fields.add("spo2")

    return fields


def esi_decision(
    *,
    life_saving: bool,
    high_risk: bool,
    resources_predicted: int | None,
    vitals: dict[str, float | None] | None,
    age_band: str | None,
) -> EsiDecision:
    """Derive an ESI level from the cited v4 decision tree (steps A->D).

    See the module docstring for the cited thresholds and the handling of
    ``resources_predicted is None``. This function is deterministic and pure.
    """
    path: list[str] = []

    # Decision A: immediate life-saving intervention?
    if life_saving:
        path.append("A: requires immediate life-saving intervention -> ESI 1")
        return EsiDecision(
            level=1,
            path=path,
            rationale="ESI 1: patient requires an immediate life-saving intervention.",
        )
    path.append("A: no immediate life-saving intervention")

    # Decision B: high-risk / confused-lethargic-disoriented / severe distress?
    if high_risk:
        path.append("B: high-risk situation (or confused/severe distress) -> ESI 2")
        return EsiDecision(
            level=2,
            path=path,
            rationale="ESI 2: high-risk presentation that should not wait.",
        )
    path.append("B: not high-risk")

    # Decision C: resource count.
    if resources_predicted is None:
        # Resource count unknown: cannot prove low acuity, so we cannot return
        # 4 or 5. Default conservatively to the two-or-more branch (ESI 3) and
        # still run Decision D on the vitals.
        path.append("C: resource count unknown -> conservatively assume >=2 resources (ESI 3)")
        level = 3
    elif resources_predicted == 0:
        path.append("C: no resources predicted -> ESI 5")
        return EsiDecision(
            level=5,
            path=path,
            rationale="ESI 5: no resources anticipated beyond history and exam.",
        )
    elif resources_predicted == 1:
        path.append("C: one resource predicted -> ESI 4")
        return EsiDecision(
            level=4,
            path=path,
            rationale="ESI 4: a single resource anticipated.",
        )
    else:  # resources_predicted >= 2
        path.append(f"C: {resources_predicted} resources predicted (>=2) -> ESI 3")
        level = 3

    # Decision D: danger-zone vitals can upgrade an ESI-3 candidate to ESI 2.
    triggered = _danger_zone_vitals(vitals, age_band)
    if triggered:
        path.append("D: danger-zone vitals (" + ", ".join(triggered) + ") -> upgrade to ESI 2")
        return EsiDecision(
            level=2,
            path=path,
            rationale=(
                "ESI 2: danger-zone vital signs (" + ", ".join(triggered) + ") "
                "upgrade the two-or-more-resource patient from ESI 3."
            ),
        )
    path.append("D: no danger-zone vitals -> stays ESI 3")
    return EsiDecision(
        level=level,
        path=path,
        rationale="ESI 3: two or more resources anticipated with no danger-zone vital signs.",
    )
