"""Unit tests for the deterministic scoring engine (app/scoring/engine.py).

Run from backend/:  pytest tests/test_scoring.py
A single named test:  pytest tests/test_scoring.py -k under_triage

These tests pin the exact ESI sub-scores and default weights so the scoring
math stays stable, assert that under-triage is penalized strictly harder than
the symmetric over-triage, verify weight renormalization when the outcome is
absent, and cover red-flag / vitals / intervention edge cases.
"""

from __future__ import annotations

import pytest

from app.models import (
    Encounter,
    ScoreReport,
    TriageCase,
    TriageDirection,
)
from app.models.encounter import HistoryTurn, Role, Stage
from app.models.score import DimensionKey
from app.models.triage_case import (
    CriticalIntervention,
    Demographics,
    Disposition,
    ExpertLabels,
    History,
    Outcome,
    Presentation,
    Provenance,
    RedFlagConcept,
    Sex,
    Vitals,
)
from app.scoring import score
from app.scoring.engine import DEFAULT_WEIGHTS, _esi_subscore

# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def make_case(
    *,
    expert_esi: int = 3,
    red_flags: list[str] | None = None,
    red_flag_concepts: list[RedFlagConcept] | None = None,
    ground_truth_vitals: Vitals | None = None,
    critical_interventions: list[CriticalIntervention] | None = None,
    outcome: Outcome | None = None,
) -> TriageCase:
    return TriageCase(
        caseId="case-1",
        source="synthetic",
        demographics=Demographics(ageBand="25-34", sex=Sex.female),
        presentation=Presentation(
            chiefComplaint="chest pain",
            history=History(
                redFlags=red_flags or [],
                redFlagConcepts=red_flag_concepts or [],
            ),
            groundTruthVitals=ground_truth_vitals or Vitals(),
        ),
        expert=ExpertLabels(
            esi=expert_esi,
            criticalInterventions=critical_interventions
            if critical_interventions is not None
            else [],
        ),
        outcome=outcome,
        provenance=Provenance(license="ODbL", deidentified=True),
    )


def make_encounter(
    *,
    esi_assigned: int | None = 3,
    history: list[HistoryTurn] | None = None,
    measured_vitals: Vitals | None = None,
    interventions: list[str] | None = None,
) -> Encounter:
    return Encounter(
        encounterId="enc-1",
        caseId="case-1",
        stage=Stage.FEEDBACK,
        chiefComplaint="chest pain",
        history=history or [],
        measuredVitals=measured_vitals or Vitals(),
        esiAssigned=esi_assigned,
        interventionsOrdered=interventions or [],
    )


def _dim(report: ScoreReport, key: DimensionKey):
    return next(d for d in report.dimensions if d.key == key)


# ---------------------------------------------------------------------------
# ESI sub-scores: all five levelsOff buckets
# ---------------------------------------------------------------------------


def test_esi_subscore_exact_match() -> None:
    assert _esi_subscore(0) == 1.0


def test_esi_subscore_over_by_1() -> None:
    assert _esi_subscore(-1) == 0.6


def test_esi_subscore_under_by_1() -> None:
    assert _esi_subscore(1) == 0.3


def test_esi_subscore_over_by_2_or_more() -> None:
    assert _esi_subscore(-2) == 0.2
    assert _esi_subscore(-3) == 0.2
    assert _esi_subscore(-4) == 0.2


def test_esi_subscore_under_by_2_or_more() -> None:
    assert _esi_subscore(2) == 0.0
    assert _esi_subscore(3) == 0.0
    assert _esi_subscore(4) == 0.0


@pytest.mark.parametrize(
    ("levels_off", "expected"),
    [(0, 1.0), (-1, 0.6), (1, 0.3), (-2, 0.2), (2, 0.0)],
)
def test_esi_subscore_all_buckets(levels_off: int, expected: float) -> None:
    assert _esi_subscore(levels_off) == expected


# ---------------------------------------------------------------------------
# Under-triage is penalized strictly harder than symmetric over-triage.
# (pytest -k under_triage selects these.)
# ---------------------------------------------------------------------------


def test_under_triage_penalized_harder_than_over_by_1() -> None:
    """Named: under_triage. Symmetric magnitude-1 errors must not be equal."""
    under_by_1_score = _esi_subscore(1)
    over_by_1_score = _esi_subscore(-1)
    assert under_by_1_score < over_by_1_score


def test_under_triage_penalized_harder_than_over_by_2() -> None:
    assert _esi_subscore(2) < _esi_subscore(-2)


def test_under_triage_direction_and_levels_off() -> None:
    # Expert says ESI 2 (acute); trainee assigns 4 (less acute) -> UNDER_TRIAGE.
    case = make_case(expert_esi=2)
    enc = make_encounter(esi_assigned=4)
    report = score(enc, case)
    assert report.esi.assigned == 4
    assert report.esi.expert == 2
    assert report.esi.correct is False
    assert report.esi.levelsOff == 2
    assert report.esi.triageDirection is TriageDirection.UNDER_TRIAGE
    assert _dim(report, DimensionKey.ESI_ACCURACY).score == 0.0


def test_over_triage_direction_and_levels_off() -> None:
    # Expert says ESI 4; trainee assigns 2 (more acute) -> OVER_TRIAGE.
    case = make_case(expert_esi=4)
    enc = make_encounter(esi_assigned=2)
    report = score(enc, case)
    assert report.esi.levelsOff == -2
    assert report.esi.triageDirection is TriageDirection.OVER_TRIAGE
    assert _dim(report, DimensionKey.ESI_ACCURACY).score == 0.2


def test_correct_esi() -> None:
    case = make_case(expert_esi=3)
    enc = make_encounter(esi_assigned=3)
    report = score(enc, case)
    assert report.esi.correct is True
    assert report.esi.triageDirection is TriageDirection.CORRECT
    assert report.esi.levelsOff == 0
    assert _dim(report, DimensionKey.ESI_ACCURACY).score == 1.0


# ---------------------------------------------------------------------------
# Cited ESI v4 decision path is woven into the ESI dimension detail (teaching
# layer). It enriches free text only — the sub-score math is unchanged.
# ---------------------------------------------------------------------------


def test_esi_detail_names_cited_decision_path_for_high_risk_expert() -> None:
    # Expert ESI 2 via step B (high-risk); trainee under-triages to ESI 4.
    case = make_case(expert_esi=2)
    case.expert.isHighRisk = True
    enc = make_encounter(esi_assigned=4)
    report = score(enc, case)
    dim = _dim(report, DimensionKey.ESI_ACCURACY)
    # The cited algorithm path is named, including the B (high-risk) decision.
    assert "cited ESI v4 algorithm" in dim.detail
    assert "A:" in dim.detail and "B:" in dim.detail
    # The sub-score is still the unchanged under-triage-by-2 value (0.0).
    assert dim.score == 0.0


def test_esi_detail_names_step_d_for_danger_zone_expert() -> None:
    # Expert ESI 3 by resources, upgraded to 2 by danger-zone vitals (step D).
    case = make_case(
        expert_esi=2,
        ground_truth_vitals=Vitals(heartRate=130.0, respiratoryRate=24.0, spo2=90.0),
    )
    case.expert.resourcesPredicted = 4
    enc = make_encounter(esi_assigned=2)
    report = score(enc, case)
    dim = _dim(report, DimensionKey.ESI_ACCURACY)
    assert "D:" in dim.detail
    assert "danger-zone" in dim.detail
    # Correct triage: sub-score unchanged at 1.0.
    assert dim.score == 1.0


def test_missing_esi_treated_as_least_acute_under_triage() -> None:
    # No ESI submitted -> treated as assigned 5 (least acute). Against an acute
    # expert this is maximal under-triage, the dangerous default.
    case = make_case(expert_esi=1)
    enc = make_encounter(esi_assigned=None)
    report = score(enc, case)
    assert report.esi.assigned == 5
    assert report.esi.triageDirection is TriageDirection.UNDER_TRIAGE
    assert _dim(report, DimensionKey.ESI_ACCURACY).score == 0.0


# ---------------------------------------------------------------------------
# Default weights are exactly as specified.
# ---------------------------------------------------------------------------


def test_default_weights_exact() -> None:
    assert DEFAULT_WEIGHTS[DimensionKey.ESI_ACCURACY] == 0.40
    assert DEFAULT_WEIGHTS[DimensionKey.HISTORY_COMPLETENESS] == 0.20
    assert DEFAULT_WEIGHTS[DimensionKey.VITALS_ACQUISITION] == 0.10
    assert DEFAULT_WEIGHTS[DimensionKey.INTERVENTION_RECOGNITION] == 0.15
    assert DEFAULT_WEIGHTS[DimensionKey.OUTCOME_ALIGNMENT] == 0.15


def test_weights_sum_to_one_with_outcome() -> None:
    case = make_case(
        expert_esi=2,
        outcome=Outcome(disposition=Disposition.ADMIT),
    )
    enc = make_encounter(esi_assigned=2)
    report = score(enc, case)
    assert len(report.dimensions) == 5
    assert sum(d.weight for d in report.dimensions) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Weight renormalization when outcome is absent.
# ---------------------------------------------------------------------------


def test_weights_renormalize_when_outcome_absent() -> None:
    case = make_case(expert_esi=3, outcome=None)
    enc = make_encounter(esi_assigned=3)
    report = score(enc, case)
    # OUTCOME_ALIGNMENT must be omitted entirely.
    keys = {d.key for d in report.dimensions}
    assert DimensionKey.OUTCOME_ALIGNMENT not in keys
    assert len(report.dimensions) == 4
    # Remaining weights renormalize to sum to 1.0.
    assert sum(d.weight for d in report.dimensions) == pytest.approx(1.0)
    # The relative proportions are preserved: ESI was 0.40 of original 0.85.
    esi_weight = _dim(report, DimensionKey.ESI_ACCURACY).weight
    assert esi_weight == pytest.approx(0.40 / 0.85)


def test_outcome_excluded_even_when_outcome_object_has_no_disposition() -> None:
    # An Outcome object present but disposition=None -> still excluded.
    case = make_case(expert_esi=3, outcome=Outcome(disposition=None))
    enc = make_encounter(esi_assigned=3)
    report = score(enc, case)
    assert DimensionKey.OUTCOME_ALIGNMENT not in {d.key for d in report.dimensions}
    assert sum(d.weight for d in report.dimensions) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Red flag detection + missedRedFlags.
# ---------------------------------------------------------------------------


def test_red_flags_none_defined_is_full_credit() -> None:
    case = make_case(red_flags=[])
    enc = make_encounter()
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert report.missedRedFlags == []


def test_red_flags_all_surfaced() -> None:
    case = make_case(red_flags=["radiation to arm", "diaphoresis"])
    enc = make_encounter(
        history=[
            HistoryTurn(role=Role.trainee, text="Does the pain show radiation to your arm?"),
            HistoryTurn(role=Role.patient, text="Yes it does."),
            HistoryTurn(role=Role.trainee, text="Any diaphoresis or sweating?"),
        ]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert report.missedRedFlags == []


def test_red_flags_partial_and_missed_list() -> None:
    case = make_case(red_flags=["radiation to arm", "syncope", "diaphoresis"])
    enc = make_encounter(
        history=[
            HistoryTurn(role=Role.trainee, text="Any radiation to the arm?"),
            # 'syncope' and 'diaphoresis' never asked.
        ]
    )
    report = score(enc, case)
    dim = _dim(report, DimensionKey.HISTORY_COMPLETENESS)
    assert dim.score == pytest.approx(1 / 3)
    assert report.missedRedFlags == ["syncope", "diaphoresis"]


def test_red_flag_detection_ignores_patient_turns() -> None:
    # Only TRAINEE turns count; a patient volunteering the fact does not.
    case = make_case(red_flags=["syncope"])
    enc = make_encounter(
        history=[
            HistoryTurn(role=Role.patient, text="I had syncope earlier."),
            HistoryTurn(role=Role.trainee, text="How long has this been going on?"),
        ]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0
    assert report.missedRedFlags == ["syncope"]


def test_red_flag_requires_all_salient_words() -> None:
    # Mentioning only 'chest' must not surface 'chest pain at rest'.
    case = make_case(red_flags=["chest pain at rest"])
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="Any chest discomfort today?")]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0


# ---------------------------------------------------------------------------
# Concept-based red-flag detection (anchors + synonyms). A flag that carries a
# concept is surfaced by paraphrase: an anchor token plus (if `any` is given)
# an any-token, both matched as whole tokens — not by verbatim transcription.
# ---------------------------------------------------------------------------


def _radiation_concept() -> RedFlagConcept:
    return RedFlagConcept(
        flag="Radiation to left arm",
        anchors=["radiat", "spread", "go", "move"],
        any=["arm", "jaw", "shoulder"],
    )


def test_concept_red_flag_surfaced_by_paraphrase() -> None:
    # Trainee never says the literal label, but asks about spreading + arm.
    case = make_case(
        red_flags=["Radiation to left arm"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[
            HistoryTurn(role=Role.trainee, text="Does the pain spread anywhere?"),
            HistoryTurn(role=Role.patient, text="Hmm, maybe."),
            HistoryTurn(role=Role.trainee, text="To your arm?"),
        ]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert "Radiation to left arm" not in report.missedRedFlags
    assert report.missedRedFlags == []


def test_concept_red_flag_missed_when_nothing_relevant_asked() -> None:
    case = make_case(
        red_flags=["Radiation to left arm"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="How long have you felt unwell?")]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0
    assert report.missedRedFlags == ["Radiation to left arm"]


def test_concept_red_flag_requires_an_anchor_not_just_an_any_token() -> None:
    # An any-token alone ("arm") with no anchor must NOT surface the flag. This
    # blocks trivial single-word gaming: naming a body part is not history-taking.
    case = make_case(
        red_flags=["Radiation to left arm"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="Is it your arm?")]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0
    assert report.missedRedFlags == ["Radiation to left arm"]


def test_concept_red_flag_requires_an_any_token_when_any_is_nonempty() -> None:
    # An anchor alone ("spread"), with a non-empty `any` list and no any-token,
    # is not enough: the concept demands both an anchor and an any-token.
    case = make_case(
        red_flags=["Radiation to left arm"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="Does the pain spread at all?")]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0
    assert report.missedRedFlags == ["Radiation to left arm"]


def test_concept_red_flag_anchor_only_surfaces_when_any_is_empty() -> None:
    # With no `any` synonyms, an anchor token alone surfaces the flag. Matching is
    # whole-token, so the anchor must be a complete word the trainee actually says
    # ("sweaty"), not a stem ("sweat") that only prefixes "sweating".
    case = make_case(
        red_flags=["Diaphoresis"],
        red_flag_concepts=[
            RedFlagConcept(flag="Diaphoresis", anchors=["sweaty", "diaphoretic", "clammy"])
        ],
    )
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="Were you clammy or sweaty with it?")]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert report.missedRedFlags == []


def test_concept_matching_is_whole_token_not_substring() -> None:
    # Anchors/any are matched as whole tokens against the transcript, so a short
    # any-token "arm" is not surfaced by "warm" and an anchor "go" is not by "ago".
    case = make_case(
        red_flags=["Radiation to left arm"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[
            HistoryTurn(role=Role.trainee, text="Is the area warm? Did this start long ago?")
        ]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0
    assert report.missedRedFlags == ["Radiation to left arm"]


def test_concept_falls_back_for_flags_without_a_concept() -> None:
    # One flag carries a concept; the other has none and must use the existing
    # all-salient-tokens fallback. Mixing the two modes in one case works.
    case = make_case(
        red_flags=["Radiation to left arm", "syncope"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[
            HistoryTurn(role=Role.trainee, text="Does the pain spread to your arm?"),
            HistoryTurn(role=Role.trainee, text="Any episodes of syncope?"),
        ]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert report.missedRedFlags == []


def test_concept_missed_flag_keeps_label_wire_shape() -> None:
    # missedRedFlags still carries the LABEL string (unchanged wire shape), even
    # when the flag is concept-backed and missed.
    case = make_case(
        red_flags=["Radiation to left arm", "syncope"],
        red_flag_concepts=[_radiation_concept()],
    )
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="Does the pain spread to your arm?")]
    )
    report = score(enc, case)
    # Concept flag surfaced; the fallback "syncope" flag missed -> label string.
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == pytest.approx(1 / 2)
    assert report.missedRedFlags == ["syncope"]


def test_concept_for_label_not_in_red_flags_is_ignored() -> None:
    # A concept whose `flag` doesn't match any redFlags label has no effect: the
    # listed redFlags drive scoring; a stray concept is simply unused.
    case = make_case(
        red_flags=["syncope"],
        red_flag_concepts=[_radiation_concept()],  # flag label not in redFlags
    )
    enc = make_encounter(
        history=[HistoryTurn(role=Role.trainee, text="Any episodes of syncope?")]
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert report.missedRedFlags == []


def test_red_flag_concept_round_trips_any_alias() -> None:
    # The `any` field round-trips through the `any_` alias on JSON dump/load.
    concept = RedFlagConcept(flag="X", anchors=["a"], any=["b"])
    dumped = concept.model_dump(mode="json")
    assert dumped["any"] == ["b"]
    assert "any_" not in dumped
    reloaded = RedFlagConcept.model_validate(dumped)
    assert reloaded.any_ == ["b"]


# ---------------------------------------------------------------------------
# Vitals acquisition edge cases.
# ---------------------------------------------------------------------------


def test_vitals_none_expected_is_full_credit() -> None:
    case = make_case(ground_truth_vitals=Vitals())  # all null -> none expected
    enc = make_encounter(measured_vitals=Vitals())
    report = score(enc, case)
    assert _dim(report, DimensionKey.VITALS_ACQUISITION).score == 1.0


def test_vitals_exact_match() -> None:
    gt = Vitals(heartRate=110.0, systolicBP=90.0, spo2=88.0)
    measured = Vitals(heartRate=110.0, systolicBP=90.0, spo2=88.0)
    case = make_case(ground_truth_vitals=gt)
    enc = make_encounter(measured_vitals=measured)
    report = score(enc, case)
    assert _dim(report, DimensionKey.VITALS_ACQUISITION).score == 1.0


def test_vitals_partial_measurement() -> None:
    gt = Vitals(heartRate=110.0, systolicBP=90.0, spo2=88.0, respiratoryRate=24.0)
    # Measured only 2 of the 4 expected.
    measured = Vitals(heartRate=110.0, spo2=88.0)
    case = make_case(ground_truth_vitals=gt)
    enc = make_encounter(measured_vitals=measured)
    report = score(enc, case)
    assert _dim(report, DimensionKey.VITALS_ACQUISITION).score == pytest.approx(0.5)


def test_vitals_extra_measurement_not_penalized() -> None:
    gt = Vitals(heartRate=110.0)  # only HR expected
    measured = Vitals(heartRate=110.0, systolicBP=120.0, spo2=99.0)  # measured extras
    case = make_case(ground_truth_vitals=gt)
    enc = make_encounter(measured_vitals=measured)
    report = score(enc, case)
    assert _dim(report, DimensionKey.VITALS_ACQUISITION).score == 1.0


# ---------------------------------------------------------------------------
# Intervention recognition edge cases.
# ---------------------------------------------------------------------------


def test_interventions_expert_none_trainee_none() -> None:
    case = make_case(critical_interventions=[CriticalIntervention.NONE])
    enc = make_encounter(interventions=[])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == 1.0


def test_interventions_expert_empty_trainee_none() -> None:
    case = make_case(critical_interventions=[])
    enc = make_encounter(interventions=[])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == 1.0


def test_interventions_expert_none_trainee_ordered_some_false_positive() -> None:
    case = make_case(critical_interventions=[CriticalIntervention.NONE])
    enc = make_encounter(interventions=["IV_ACCESS"])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == 0.0


def test_interventions_exact_match() -> None:
    case = make_case(
        critical_interventions=[CriticalIntervention.IV_ACCESS, CriticalIntervention.ECG]
    )
    enc = make_encounter(interventions=["IV_ACCESS", "ECG"])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == 1.0


def test_interventions_case_insensitive_match() -> None:
    case = make_case(critical_interventions=[CriticalIntervention.IV_ACCESS])
    enc = make_encounter(interventions=["  iv_access "])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == 1.0


def test_interventions_f1_partial_overlap() -> None:
    # Expert {IV_ACCESS, ECG, OXYGEN}; trainee {IV_ACCESS, ANALGESIA}.
    # TP=1, FP=1, FN=2 -> F1 = 2*1 / (2*1 + 1 + 2) = 2/5 = 0.4.
    case = make_case(
        critical_interventions=[
            CriticalIntervention.IV_ACCESS,
            CriticalIntervention.ECG,
            CriticalIntervention.OXYGEN,
        ]
    )
    enc = make_encounter(interventions=["IV_ACCESS", "ANALGESIA"])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == pytest.approx(0.4)


def test_interventions_trainee_ordered_none_sentinel_with_real_expert() -> None:
    # Expert expects ECG; trainee explicitly ordered NONE -> ordered nothing real.
    # TP=0, FP=0, FN=1 -> F1 = 0.
    case = make_case(critical_interventions=[CriticalIntervention.ECG])
    enc = make_encounter(interventions=["NONE"])
    report = score(enc, case)
    assert _dim(report, DimensionKey.INTERVENTION_RECOGNITION).score == 0.0


# ---------------------------------------------------------------------------
# Outcome alignment heuristic.
# ---------------------------------------------------------------------------


def test_outcome_high_acuity_consistent_with_acute_esi() -> None:
    case = make_case(expert_esi=1, outcome=Outcome(disposition=Disposition.ICU))
    enc = make_encounter(esi_assigned=1)
    report = score(enc, case)
    assert _dim(report, DimensionKey.OUTCOME_ALIGNMENT).score == 1.0


def test_outcome_high_acuity_inconsistent_with_low_esi() -> None:
    case = make_case(expert_esi=1, outcome=Outcome(disposition=Disposition.ICU))
    enc = make_encounter(esi_assigned=5)
    report = score(enc, case)
    assert _dim(report, DimensionKey.OUTCOME_ALIGNMENT).score == 0.0


def test_outcome_low_acuity_consistent_with_low_esi() -> None:
    case = make_case(expert_esi=4, outcome=Outcome(disposition=Disposition.DISCHARGE))
    enc = make_encounter(esi_assigned=4)
    report = score(enc, case)
    assert _dim(report, DimensionKey.OUTCOME_ALIGNMENT).score == 1.0


def test_outcome_transfer_is_neutral() -> None:
    case = make_case(expert_esi=3, outcome=Outcome(disposition=Disposition.TRANSFER))
    enc = make_encounter(esi_assigned=3)
    report = score(enc, case)
    assert _dim(report, DimensionKey.OUTCOME_ALIGNMENT).score == 0.5


# ---------------------------------------------------------------------------
# Overall report invariants.
# ---------------------------------------------------------------------------


def test_overall_percent_bounds_and_narrative_empty() -> None:
    case = make_case(
        expert_esi=2,
        red_flags=["radiation to arm"],
        ground_truth_vitals=Vitals(heartRate=120.0, spo2=85.0),
        critical_interventions=[CriticalIntervention.OXYGEN, CriticalIntervention.IV_ACCESS],
        outcome=Outcome(disposition=Disposition.ADMIT),
    )
    enc = make_encounter(
        esi_assigned=2,
        history=[HistoryTurn(role=Role.trainee, text="radiation to arm?")],
        measured_vitals=Vitals(heartRate=120.0, spo2=85.0),
        interventions=["OXYGEN", "IV_ACCESS"],
    )
    report = score(enc, case)
    assert 0.0 <= report.overallPercent <= 100.0
    assert report.narrative == ""
    assert report.encounterId == "enc-1"


def test_perfect_encounter_scores_100() -> None:
    case = make_case(
        expert_esi=2,
        red_flags=["radiation to arm"],
        ground_truth_vitals=Vitals(heartRate=120.0),
        critical_interventions=[CriticalIntervention.OXYGEN],
        outcome=Outcome(disposition=Disposition.ADMIT),
    )
    enc = make_encounter(
        esi_assigned=2,
        history=[HistoryTurn(role=Role.trainee, text="any radiation to arm?")],
        measured_vitals=Vitals(heartRate=120.0),
        interventions=["OXYGEN"],
    )
    report = score(enc, case)
    assert report.overallPercent == 100.0


def test_worst_encounter_scores_low_and_bounded() -> None:
    # Maximal under-triage, missed everything.
    case = make_case(
        expert_esi=1,
        red_flags=["radiation to arm"],
        ground_truth_vitals=Vitals(heartRate=120.0),
        critical_interventions=[CriticalIntervention.OXYGEN],
        outcome=Outcome(disposition=Disposition.ICU),
    )
    enc = make_encounter(
        esi_assigned=5,
        history=[],
        measured_vitals=Vitals(),
        interventions=["ANTIBIOTICS"],  # wrong intervention
    )
    report = score(enc, case)
    assert report.overallPercent == 0.0
    assert report.esi.triageDirection is TriageDirection.UNDER_TRIAGE


def test_overall_percent_is_rounded_to_one_decimal() -> None:
    # Construct a case whose weighted sum is not a clean decimal, then confirm
    # the public number is rounded to one decimal place.
    case = make_case(expert_esi=3, red_flags=["a b c"])  # 0 surfaced -> history 0
    enc = make_encounter(esi_assigned=3)  # ESI 1.0, vitals 1.0, interventions 1.0
    report = score(enc, case)
    # No outcome: weights renormalize over 0.85. Sum =
    #   ESI 1.0*0.40 + HIST 0.0*0.20 + VIT 1.0*0.10 + INT 1.0*0.15 = 0.65 / 0.85
    expected = round((0.65 / 0.85) * 100, 1)
    assert report.overallPercent == expected
    # Exactly one decimal place at most.
    assert round(report.overallPercent, 1) == report.overallPercent


# ---------------------------------------------------------------------------
# No-decision (esiAssigned is None) must never be credited as correct
# ---------------------------------------------------------------------------
def test_no_esi_decision_never_credited_even_for_expert_esi_5() -> None:
    """A trainee who assigns no ESI must score 0 on ESI accuracy, even when the
    least-acute sentinel (5) would otherwise 'match' an expert ESI-5 case."""
    case = make_case(expert_esi=5)
    enc = make_encounter(esi_assigned=None)
    report = score(enc, case)
    esi_dim = _dim(report, DimensionKey.ESI_ACCURACY)
    assert esi_dim.score == 0.0
    # Not reported as a correct triage.
    assert report.esi.correct is False
    assert report.esi.triageDirection == TriageDirection.UNDER_TRIAGE


def test_no_esi_decision_blank_submission_scores_low_on_esi5_case() -> None:
    """The whole 'submit nothing on an ESI-5 case' exploit: ESI accuracy is 0, so
    the overall cannot be inflated by a sentinel match on the top-weighted dim."""
    case = make_case(expert_esi=5)
    enc = make_encounter(esi_assigned=None, interventions=[])
    report = score(enc, case)
    # ESI_ACCURACY (0.40 weight) contributes 0; overall must be well below a pass.
    assert _dim(report, DimensionKey.ESI_ACCURACY).score == 0.0
    assert report.overallPercent < 60.0


def test_no_esi_decision_for_acute_case_still_zero_esi() -> None:
    case = make_case(expert_esi=1)
    report = score(make_encounter(esi_assigned=None), case)
    assert _dim(report, DimensionKey.ESI_ACCURACY).score == 0.0
    assert report.esi.triageDirection == TriageDirection.UNDER_TRIAGE


# ---------------------------------------------------------------------------
# Red-flag matching is whole-token, not bare substring
# ---------------------------------------------------------------------------
def test_red_flag_not_surfaced_by_substring_of_a_word() -> None:
    """'arm' must not be surfaced by 'warm'; 'syncope' not by 'presyncope'."""
    case = make_case(expert_esi=3, red_flags=["arm", "syncope"])
    enc = make_encounter(
        esi_assigned=3,
        history=[
            HistoryTurn(role=Role.trainee, text="Is the area warm to the touch?"),
            HistoryTurn(role=Role.trainee, text="Any presyncope earlier today?"),
        ],
    )
    report = score(enc, case)
    # Neither red flag should count as surfaced -> both missed, history score 0.
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 0.0
    assert set(report.missedRedFlags) == {"arm", "syncope"}


def test_red_flag_surfaced_by_whole_word() -> None:
    case = make_case(expert_esi=3, red_flags=["left arm pain"])
    enc = make_encounter(
        esi_assigned=3,
        history=[HistoryTurn(role=Role.trainee, text="Does the pain go to your left arm?")],
    )
    report = score(enc, case)
    assert _dim(report, DimensionKey.HISTORY_COMPLETENESS).score == 1.0
    assert report.missedRedFlags == []
