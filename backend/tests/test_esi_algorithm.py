"""Unit tests for the cited ESI v4 decision-tree algorithm (app/scoring/esi_algorithm.py).

Run from backend/:  pytest tests/test_esi_algorithm.py

These tests pin the four canonical ESI v4 decision points (steps A->D) and the
adult danger-zone vital-sign thresholds, demonstrate that the pediatric thresholds
differ from the adult ones, and assert the *publication-grade* guarantee that every
bundled synthetic case's authored ``expert.esi`` agrees with the level the cited
algorithm derives from that case's labels + ground-truth vitals + age band.

Source for thresholds: Gilboy N, Tanabe P, Travers D, Rosenau AM. Emergency Severity
Index (ESI): A Triage Tool for Emergency Department Care, Version 4, Implementation
Handbook 2012 Edition. AHRQ Publication No. 12-0014. Rockville, MD: Agency for
Healthcare Research and Quality; 2011.
"""

from __future__ import annotations

import pytest

from app.scoring.esi_algorithm import EsiDecision, esi_decision

# ---------------------------------------------------------------------------
# Step A: immediate life-saving intervention -> ESI 1
# ---------------------------------------------------------------------------


def test_step_a_life_saving_is_esi_1() -> None:
    decision = esi_decision(
        life_saving=True,
        high_risk=True,  # irrelevant: A short-circuits
        resources_predicted=5,
        vitals=None,
        age_band="65-74",
    )
    assert decision.level == 1
    assert decision.path[0].startswith("A")
    assert "1" in decision.rationale


def test_step_a_returns_frozen_dataclass() -> None:
    decision = esi_decision(
        life_saving=True,
        high_risk=False,
        resources_predicted=None,
        vitals=None,
        age_band="unknown",
    )
    assert isinstance(decision, EsiDecision)
    with pytest.raises(AttributeError):
        decision.level = 2  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Step B: high-risk / confused / severe pain -> ESI 2 (only if not life-saving)
# ---------------------------------------------------------------------------


def test_step_b_high_risk_not_life_saving_is_esi_2() -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=True,
        resources_predicted=5,
        vitals={"heartRate": 96, "respiratoryRate": 18, "spo2": 96},
        age_band="55-64",
    )
    assert decision.level == 2
    # Path runs through A (negative) then B (positive).
    assert decision.path[0].startswith("A")
    assert any(step.startswith("B") for step in decision.path)


# ---------------------------------------------------------------------------
# Step C: resource count -> 5 / 4 / 3
# ---------------------------------------------------------------------------


def test_step_c_zero_resources_is_esi_5() -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=0,
        vitals={"heartRate": 74},
        age_band="45-54",
    )
    assert decision.level == 5
    assert any(step.startswith("C") for step in decision.path)


def test_step_c_one_resource_is_esi_4() -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=1,
        vitals={"heartRate": 72},
        age_band="18-24",
    )
    assert decision.level == 4
    assert any(step.startswith("C") for step in decision.path)


def test_step_c_two_or_more_resources_normal_vitals_is_esi_3() -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=4,
        vitals={"heartRate": 98, "respiratoryRate": 18, "spo2": 99},
        age_band="25-34",
    )
    assert decision.level == 3
    assert any(step.startswith("C") for step in decision.path)


# ---------------------------------------------------------------------------
# Step D: danger-zone vitals upgrade ESI 3 -> ESI 2 (adult thresholds)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "vitals",
    [
        {"heartRate": 98, "respiratoryRate": 18, "spo2": 90},  # SpO2 < 92
        {"heartRate": 98, "respiratoryRate": 22, "spo2": 98},  # RR > 20
        {"heartRate": 110, "respiratoryRate": 18, "spo2": 98},  # HR > 100
    ],
)
def test_step_d_danger_zone_vital_upgrades_to_esi_2(vitals: dict[str, float]) -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=4,
        vitals=vitals,
        age_band="25-34",
    )
    assert decision.level == 2
    assert any(step.startswith("D") for step in decision.path)


def test_step_d_not_triggered_by_normal_vitals_stays_esi_3() -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=4,
        vitals={"heartRate": 100, "respiratoryRate": 20, "spo2": 92},  # all at boundary
        age_band="25-34",
    )
    # Boundaries are NOT in the danger zone (strict >/<), so this stays ESI 3.
    assert decision.level == 3


# ---------------------------------------------------------------------------
# Pediatric thresholds differ from adult.
# ---------------------------------------------------------------------------


def test_pediatric_threshold_differs_from_adult() -> None:
    # HR 110 with >=2 resources: in an adult this is a danger-zone HR (>100) and
    # upgrades to ESI 2; in the pediatric band ("0-17" -> 5-12 yr bucket, HR > 120)
    # 110 is below the pediatric HR danger threshold, so it stays ESI 3. This is
    # exactly the adult-vs-pediatric threshold difference the handbook encodes.
    shared_vitals = {"heartRate": 110, "respiratoryRate": 24, "spo2": 98}
    adult = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=4,
        vitals=shared_vitals,
        age_band="25-34",
    )
    child = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=4,
        vitals=shared_vitals,
        age_band="0-17",
    )
    assert adult.level == 2  # adult: HR 110 > 100 -> danger zone
    assert child.level == 3  # child: HR 110 below pediatric threshold (120)
    assert adult.level != child.level


# ---------------------------------------------------------------------------
# Resources unknown -> conservative handling, documented in the module.
# ---------------------------------------------------------------------------


def test_resources_none_low_signal_defaults_conservatively_to_esi_3() -> None:
    # No life-saving, not high-risk, resources unknown: cannot reach a definitive
    # C/D level. The module documents that this defaults conservatively to ESI 3.
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=None,
        vitals={"heartRate": 80, "respiratoryRate": 16, "spo2": 99},
        age_band="25-34",
    )
    assert decision.level == 3


def test_resources_none_danger_zone_still_upgrades_to_2() -> None:
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=None,
        vitals={"heartRate": 130, "respiratoryRate": 16, "spo2": 99},
        age_band="25-34",
    )
    assert decision.level == 2
    assert any(step.startswith("D") for step in decision.path)


def test_vitals_none_two_or_more_resources_is_esi_3() -> None:
    # Step D cannot fire without vitals; >=2 resources without danger-zone data
    # remains ESI 3.
    decision = esi_decision(
        life_saving=False,
        high_risk=False,
        resources_predicted=3,
        vitals=None,
        age_band="25-34",
    )
    assert decision.level == 3


# ---------------------------------------------------------------------------
# PUBLICATION-GRADE GUARANTEE: every bundled synthetic case's authored
# expert.esi agrees with the cited algorithm applied to its own labels.
# ---------------------------------------------------------------------------


def _vitals_to_dict(case_vitals: object) -> dict[str, float | None]:
    # case_vitals is a Vitals model; expose the danger-zone fields the algorithm reads.
    return {
        "heartRate": getattr(case_vitals, "heartRate", None),
        "respiratoryRate": getattr(case_vitals, "respiratoryRate", None),
        "spo2": getattr(case_vitals, "spo2", None),
    }


def test_every_synthetic_case_agrees_with_cited_algorithm() -> None:
    from app.data import registry

    registry.clear_cache()
    cases = registry.load_cases(["synthetic"])
    registry.clear_cache()
    assert cases, "expected bundled synthetic cases to load offline"

    mismatches: list[str] = []
    for case in cases:
        decision = esi_decision(
            life_saving=case.expert.requiresLifeSaving,
            high_risk=case.expert.isHighRisk,
            resources_predicted=case.expert.resourcesPredicted,
            vitals=_vitals_to_dict(case.presentation.groundTruthVitals),
            age_band=case.demographics.ageBand,
        )
        if decision.level != case.expert.esi:
            mismatches.append(
                f"{case.caseId}: authored ESI {case.expert.esi} != "
                f"algorithm ESI {decision.level} via {decision.path}"
            )
    assert not mismatches, "ESI algorithm disagrees with authored labels:\n" + "\n".join(
        f"  - {m}" for m in mismatches
    )
