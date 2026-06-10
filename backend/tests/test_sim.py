"""Unit tests for the encounter state machine (app/sim/machine.py).

Covers: a legal full walk CASE_LOAD -> ... -> FEEDBACK; every illegal transition
raising StageError; expert labels never leaking onto the Encounter before FEEDBACK;
measure_vitals revealing only requested fields; and rejection of bad ESI / field
names.
"""

from __future__ import annotations

import pytest

from app.models import (
    CriticalIntervention,
    Demographics,
    Disposition,
    Encounter,
    ExpertLabels,
    HistoryTurn,
    Outcome,
    Presentation,
    Provenance,
    Stage,
    TriageCase,
    Vitals,
)
from app.models.encounter import STAGE_ORDER, Role
from app.models.triage_case import AVPU, History, Sex
from app.sim import (
    StageError,
    advance,
    assign_esi,
    create_encounter,
    measure_vitals,
    order_interventions,
    record_history_turn,
)


def make_case() -> TriageCase:
    """A fully-populated TriageCase with a distinctive expert block + ground truth."""
    return TriageCase(
        caseId="case-001",
        source="synthetic",
        demographics=Demographics(ageBand="65-74", sex=Sex.male),
        presentation=Presentation(
            chiefComplaint="Crushing chest pain for 30 minutes",
            history=History(
                hpi="Sudden substernal pressure radiating to the left arm.",
                pmh=["hypertension", "type 2 diabetes"],
                medications=["metformin", "lisinopril"],
                allergies=["penicillin"],
                socialHistory="Former smoker.",
                redFlags=["diaphoresis", "radiation to arm", "exertional onset"],
            ),
            groundTruthVitals=Vitals(
                heartRate=112.0,
                systolicBP=158.0,
                diastolicBP=94.0,
                respiratoryRate=22.0,
                spo2=94.0,
                temperatureC=37.1,
                painScore=9,
                glucose=180.0,
                avpu=AVPU.A,
            ),
        ),
        expert=ExpertLabels(
            esi=2,
            esiRationale="High-risk presentation for ACS.",
            criticalInterventions=[
                CriticalIntervention.ECG,
                CriticalIntervention.IV_ACCESS,
                CriticalIntervention.CARDIAC_MONITOR,
            ],
            resourcesPredicted=4,
        ),
        outcome=Outcome(
            disposition=Disposition.ADMIT,
            edLengthOfStayMinutes=240,
            diagnosisCategories=["acute coronary syndrome"],
        ),
        provenance=Provenance(license="OPEN", deidentified=True, sourceRef="ref-1"),
    )


def walk_to(case: TriageCase, target: Stage) -> Encounter:
    """Advance a fresh encounter forward to ``target`` via single legal steps.

    ``create_encounter`` already yields CASE_LOAD, so for that target we return
    immediately without advancing.
    """
    enc = create_encounter(case)
    target_idx = STAGE_ORDER.index(target)
    for stage in STAGE_ORDER[1 : target_idx + 1]:
        enc = advance(enc, stage)
    return enc


# --------------------------------------------------------------------------- #
# create_encounter
# --------------------------------------------------------------------------- #


def test_create_encounter_initial_state() -> None:
    case = make_case()
    enc = create_encounter(case)

    assert enc.stage is Stage.CASE_LOAD
    assert enc.caseId == case.caseId
    assert enc.chiefComplaint == case.presentation.chiefComplaint
    assert enc.startedAt is not None
    assert enc.completedAt is None
    assert enc.encounterId  # non-empty id assigned
    # Nothing measured / decided yet.
    assert enc.history == []
    assert enc.measuredVitals == Vitals()
    assert enc.esiAssigned is None
    assert enc.interventionsOrdered == []
    assert enc.scoreReport is None


def test_create_encounter_unique_ids() -> None:
    case = make_case()
    assert create_encounter(case).encounterId != create_encounter(case).encounterId


def test_create_encounter_never_copies_expert_labels() -> None:
    """The expert ESI and rationale must not appear anywhere on the Encounter."""
    case = make_case()
    enc = create_encounter(case)

    dumped = enc.model_dump_json()
    assert "esiRationale" not in dumped
    assert "High-risk presentation for ACS" not in dumped
    # The Encounter has no field that could hold expert labels before scoring.
    assert enc.esiAssigned is None
    assert enc.scoreReport is None


# --------------------------------------------------------------------------- #
# advance — legal full walk + illegal transitions
# --------------------------------------------------------------------------- #


def test_legal_full_walk() -> None:
    case = make_case()
    enc = create_encounter(case)
    assert enc.stage is Stage.CASE_LOAD

    for expected in STAGE_ORDER[1:]:
        enc = advance(enc, expected)
        assert enc.stage is expected

    assert enc.stage is Stage.FEEDBACK
    assert enc.completedAt is not None


def test_advance_to_feedback_stamps_completed_at() -> None:
    enc = walk_to(make_case(), Stage.INTERVENTIONS)
    assert enc.completedAt is None
    enc = advance(enc, Stage.FEEDBACK)
    assert enc.completedAt is not None


def test_advance_is_pure_does_not_mutate_input() -> None:
    enc = create_encounter(make_case())
    _ = advance(enc, Stage.HISTORY)
    assert enc.stage is Stage.CASE_LOAD  # original untouched


def test_advance_rejects_skipping_ahead() -> None:
    enc = create_encounter(make_case())  # CASE_LOAD
    with pytest.raises(StageError):
        advance(enc, Stage.VITALS)  # skips HISTORY
    with pytest.raises(StageError):
        advance(enc, Stage.FEEDBACK)  # skips everything


def test_advance_rejects_backward() -> None:
    enc = walk_to(make_case(), Stage.VITALS)
    for earlier in (Stage.CASE_LOAD, Stage.HISTORY):
        with pytest.raises(StageError):
            advance(enc, earlier)


def test_advance_rejects_same_stage() -> None:
    enc = walk_to(make_case(), Stage.HISTORY)
    with pytest.raises(StageError):
        advance(enc, Stage.HISTORY)


def test_every_illegal_transition_raises() -> None:
    """Exhaustively: from each stage, any non-immediate-or-forward... actually any
    target whose index <= current index must raise; forward jumps that skip a stage
    must also raise."""
    case = make_case()
    for from_stage in STAGE_ORDER:
        enc = walk_to(case, from_stage)
        from_idx = STAGE_ORDER.index(from_stage)
        for to_stage in STAGE_ORDER:
            to_idx = STAGE_ORDER.index(to_stage)
            is_single_forward_step = to_idx == from_idx + 1
            if is_single_forward_step:
                continue  # the only legal move
            with pytest.raises(StageError):
                advance(enc, to_stage)


# --------------------------------------------------------------------------- #
# record_history_turn
# --------------------------------------------------------------------------- #


def test_record_history_turn_only_during_history() -> None:
    case = make_case()
    turn = HistoryTurn(role=Role.trainee, text="What brings you in?")

    # Illegal in every stage except HISTORY.
    for stage in STAGE_ORDER:
        enc = walk_to(case, stage)
        if stage is Stage.HISTORY:
            continue
        with pytest.raises(StageError):
            record_history_turn(enc, turn)


def test_record_history_turn_appends() -> None:
    enc = walk_to(make_case(), Stage.HISTORY)
    t1 = HistoryTurn(role=Role.trainee, text="What brings you in?")
    t2 = HistoryTurn(role=Role.patient, text="Bad chest pain.")

    enc1 = record_history_turn(enc, t1)
    enc2 = record_history_turn(enc1, t2)

    assert [t.text for t in enc2.history] == [t1.text, t2.text]
    # Purity: earlier encounters unchanged.
    assert enc.history == []
    assert len(enc1.history) == 1


# --------------------------------------------------------------------------- #
# measure_vitals
# --------------------------------------------------------------------------- #


def test_measure_vitals_only_during_vitals() -> None:
    case = make_case()
    for stage in STAGE_ORDER:
        enc = walk_to(case, stage)
        if stage is Stage.VITALS:
            continue
        with pytest.raises(StageError):
            measure_vitals(enc, case, ["heartRate"])


def test_measure_vitals_reveals_only_requested_fields() -> None:
    case = make_case()
    enc = walk_to(case, Stage.VITALS)

    enc = measure_vitals(enc, case, ["heartRate", "spo2"])

    # Requested fields revealed with ground-truth values.
    assert enc.measuredVitals.heartRate == case.presentation.groundTruthVitals.heartRate
    assert enc.measuredVitals.spo2 == case.presentation.groundTruthVitals.spo2
    # Everything else stays None — not leaked.
    assert enc.measuredVitals.systolicBP is None
    assert enc.measuredVitals.respiratoryRate is None
    assert enc.measuredVitals.temperatureC is None
    assert enc.measuredVitals.painScore is None
    assert enc.measuredVitals.glucose is None
    assert enc.measuredVitals.avpu is None


def test_measure_vitals_accumulates_across_calls() -> None:
    case = make_case()
    enc = walk_to(case, Stage.VITALS)
    enc = measure_vitals(enc, case, ["heartRate"])
    enc = measure_vitals(enc, case, ["spo2"])
    assert enc.measuredVitals.heartRate is not None
    assert enc.measuredVitals.spo2 is not None
    assert enc.measuredVitals.systolicBP is None


def test_measure_vitals_unknown_field_raises_value_error() -> None:
    case = make_case()
    enc = walk_to(case, Stage.VITALS)
    with pytest.raises(ValueError):
        measure_vitals(enc, case, ["bloodPressure"])  # not a Vitals field
    with pytest.raises(ValueError):
        measure_vitals(enc, case, ["heartRate", "nonsense"])


# --------------------------------------------------------------------------- #
# assign_esi
# --------------------------------------------------------------------------- #


def test_assign_esi_only_during_esi_assignment() -> None:
    case = make_case()
    for stage in STAGE_ORDER:
        enc = walk_to(case, stage)
        if stage is Stage.ESI_ASSIGNMENT:
            continue
        with pytest.raises(StageError):
            assign_esi(enc, 3)


def test_assign_esi_records_value() -> None:
    enc = walk_to(make_case(), Stage.ESI_ASSIGNMENT)
    for value in (1, 2, 3, 4, 5):
        out = assign_esi(enc, value)
        assert out.esiAssigned == value
    # Purity.
    assert enc.esiAssigned is None


@pytest.mark.parametrize("bad", [0, 6, -1, 10])
def test_assign_esi_out_of_range_raises(bad: int) -> None:
    enc = walk_to(make_case(), Stage.ESI_ASSIGNMENT)
    with pytest.raises(ValueError):
        assign_esi(enc, bad)


def test_assign_esi_rejects_bool() -> None:
    enc = walk_to(make_case(), Stage.ESI_ASSIGNMENT)
    with pytest.raises(ValueError):
        assign_esi(enc, True)  # bool is an int subclass; must be rejected


# --------------------------------------------------------------------------- #
# order_interventions
# --------------------------------------------------------------------------- #


def test_order_interventions_only_during_interventions() -> None:
    case = make_case()
    for stage in STAGE_ORDER:
        enc = walk_to(case, stage)
        if stage is Stage.INTERVENTIONS:
            continue
        with pytest.raises(StageError):
            order_interventions(enc, ["ECG"])


def test_order_interventions_records_items() -> None:
    enc = walk_to(make_case(), Stage.INTERVENTIONS)
    out = order_interventions(enc, ["ECG", "IV_ACCESS"])
    assert out.interventionsOrdered == ["ECG", "IV_ACCESS"]
    # Replacing on a second call.
    out2 = order_interventions(out, ["OXYGEN"])
    assert out2.interventionsOrdered == ["OXYGEN"]
    # Purity.
    assert enc.interventionsOrdered == []


# --------------------------------------------------------------------------- #
# Expert-label confidentiality across the whole legal walk
# --------------------------------------------------------------------------- #


def test_expert_labels_never_on_encounter_before_feedback() -> None:
    """Walk the full machine and assert the expert ESI / rationale / intervention
    list never surface on the serialized Encounter prior to FEEDBACK."""
    case = make_case()
    secret_markers = [
        case.expert.esiRationale or "",
        "criticalInterventions",
        "resourcesPredicted",
    ]

    enc = create_encounter(case)
    stages_seen = [enc.stage]

    # CASE_LOAD -> HISTORY
    enc = advance(enc, Stage.HISTORY)
    enc = record_history_turn(enc, HistoryTurn(role=Role.trainee, text="hi"))
    stages_seen.append(enc.stage)

    # HISTORY -> VITALS
    enc = advance(enc, Stage.VITALS)
    enc = measure_vitals(enc, case, ["heartRate", "spo2"])
    stages_seen.append(enc.stage)

    # VITALS -> ESI_ASSIGNMENT (trainee assigns a *less* acute level -> under-triage)
    enc = advance(enc, Stage.ESI_ASSIGNMENT)
    enc = assign_esi(enc, 4)  # expert is 2; under-triage, the headline failure
    stages_seen.append(enc.stage)

    # ESI_ASSIGNMENT -> INTERVENTIONS
    enc = advance(enc, Stage.INTERVENTIONS)
    enc = order_interventions(enc, ["ECG"])
    stages_seen.append(enc.stage)

    # Through all pre-FEEDBACK stages the expert block must be invisible.
    pre_feedback_dump = enc.model_dump_json()
    for marker in secret_markers:
        if marker:
            assert marker not in pre_feedback_dump
    # The assigned ESI is the trainee's choice, not the expert's.
    assert enc.esiAssigned == 4
    assert enc.scoreReport is None  # scoring is a different module; not set here

    # INTERVENTIONS -> FEEDBACK only moves the stage (scoring composed by the API).
    enc = advance(enc, Stage.FEEDBACK)
    assert enc.stage is Stage.FEEDBACK
    assert enc.scoreReport is None  # sim does not attach scoring
    assert stages_seen == list(STAGE_ORDER[:-1])
