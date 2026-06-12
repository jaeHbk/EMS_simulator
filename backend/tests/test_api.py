"""End-to-end API tests: walk a full encounter through every route.

Uses ``fastapi.testclient.TestClient`` against the real app, with
``LLM_PROVIDER=local`` so there is no network and no API key — the offline
scripted patient + feedback narrative make the whole flow deterministic.

Two guarantees this file enforces:

1. **Stage progression + final scoring.** A trainee can drive an encounter
   CASE_LOAD -> HISTORY -> VITALS -> ESI_ASSIGNMENT -> INTERVENTIONS -> FEEDBACK
   entirely through the public routes, ending with a populated ``ScoreReport``.
2. **Expert labels stay server-side.** No pre-FEEDBACK response body may contain
   the case's expert labels (``expert``, ``esiRationale``, ``criticalInterventions``,
   ``resourcesPredicted``) or a ``scoreReport``. The reference ESI surfaces only in
   the FEEDBACK ``scoreReport``.

Routes are also checked for clean 4xx mapping of domain errors.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

# Force the fully-offline configuration BEFORE the app / settings are imported.
os.environ["LLM_PROVIDER"] = "local"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["ENABLED_SOURCES"] = "synthetic"

from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.data import registry as data_registry  # noqa: E402

# Forbidden keys: anything that would leak the hidden expert labels to the client
# before the FEEDBACK stage.
_EXPERT_KEYS = {"expert", "esiRationale", "criticalInterventions", "resourcesPredicted"}


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A TestClient bound to a fresh in-memory store and offline provider."""
    # Reset cached settings so the env above is picked up deterministically.
    config._settings = None
    data_registry.clear_cache()

    from app.main import app  # imported here so it builds against the test env

    # Entering the context manager runs the lifespan (store.init_db).
    with TestClient(app) as test_client:
        yield test_client

    config._settings = None
    data_registry.clear_cache()


def _assert_no_expert_leak(body: dict) -> None:
    """The encounter wire format must never carry expert labels pre-FEEDBACK."""
    assert body.get("scoreReport") is None, "scoreReport must be null before FEEDBACK"
    # No expert-only key may appear anywhere in the serialized encounter.
    flat = repr(body)
    for key in _EXPERT_KEYS:
        assert key not in body, f"expert key {key!r} leaked into the encounter body"
    # The encounter only legitimately holds these top-level keys.
    allowed = {
        "encounterId",
        "caseId",
        "stage",
        "chiefComplaint",
        "history",
        "measuredVitals",
        "esiAssigned",
        "interventionsOrdered",
        "scoreReport",
        "startedAt",
        "completedAt",
        "traineeId",
    }
    assert set(body) <= allowed, f"unexpected keys in encounter: {set(body) - allowed}"
    # Defensive: an esiRationale string would be the most likely leak vector.
    assert "esiRationale" not in flat


def test_health() -> None:
    config._settings = None
    from app.main import app

    with TestClient(app) as c:
        resp = c.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_full_encounter_walk(client: TestClient) -> None:
    # --- CASE_LOAD: create an encounter (seeded pick for reproducibility) ---
    resp = client.post("/api/encounters", json={"sources": ["synthetic"], "seed": 7})
    assert resp.status_code == 200, resp.text
    enc = resp.json()
    encounter_id = enc["encounterId"]
    assert enc["stage"] == "CASE_LOAD"
    assert enc["chiefComplaint"], "chief complaint should be echoed from the case"
    _assert_no_expert_leak(enc)

    # GET round-trips the persisted encounter.
    got = client.get(f"/api/encounters/{encounter_id}")
    assert got.status_code == 200
    assert got.json()["encounterId"] == encounter_id
    _assert_no_expert_leak(got.json())

    # --- HISTORY ---
    resp = client.post(f"/api/encounters/{encounter_id}/advance", json={"to": "HISTORY"})
    assert resp.status_code == 200
    assert resp.json()["stage"] == "HISTORY"
    _assert_no_expert_leak(resp.json())

    resp = client.post(
        f"/api/encounters/{encounter_id}/history",
        json={"text": "Hello, what brings you in today? Any pain or allergies?"},
    )
    assert resp.status_code == 200, resp.text
    enc = resp.json()
    # Trainee turn + patient reply both appended, in order.
    assert len(enc["history"]) == 2
    assert enc["history"][0]["role"] == "trainee"
    assert enc["history"][1]["role"] == "patient"
    assert enc["history"][1]["text"], "the local patient stub must reply with something"
    _assert_no_expert_leak(enc)

    # --- VITALS ---
    resp = client.post(f"/api/encounters/{encounter_id}/advance", json={"to": "VITALS"})
    assert resp.status_code == 200
    resp = client.post(
        f"/api/encounters/{encounter_id}/vitals",
        json={"fields": ["heartRate", "systolicBP", "spo2", "respiratoryRate"]},
    )
    assert resp.status_code == 200, resp.text
    enc = resp.json()
    measured = enc["measuredVitals"]
    assert measured["heartRate"] is not None
    assert measured["spo2"] is not None
    # Fields the trainee did NOT measure stay null (only what was asked is revealed).
    assert measured["glucose"] is None
    _assert_no_expert_leak(enc)

    # --- ESI_ASSIGNMENT ---
    resp = client.post(f"/api/encounters/{encounter_id}/advance", json={"to": "ESI_ASSIGNMENT"})
    assert resp.status_code == 200
    resp = client.post(f"/api/encounters/{encounter_id}/esi", json={"esi": 3})
    assert resp.status_code == 200, resp.text
    enc = resp.json()
    assert enc["esiAssigned"] == 3
    _assert_no_expert_leak(enc)

    # --- INTERVENTIONS ---
    resp = client.post(f"/api/encounters/{encounter_id}/advance", json={"to": "INTERVENTIONS"})
    assert resp.status_code == 200
    resp = client.post(
        f"/api/encounters/{encounter_id}/interventions",
        json={"items": ["ECG", "IV_ACCESS"]},
    )
    assert resp.status_code == 200, resp.text
    enc = resp.json()
    assert enc["interventionsOrdered"] == ["ECG", "IV_ACCESS"]
    _assert_no_expert_leak(enc)

    # --- FEEDBACK: scoring numbers + LLM narrative, expert labels now revealed ---
    resp = client.post(f"/api/encounters/{encounter_id}/feedback")
    assert resp.status_code == 200, resp.text
    enc = resp.json()
    assert enc["stage"] == "FEEDBACK"
    assert enc["completedAt"] is not None

    report = enc["scoreReport"]
    assert report is not None, "FEEDBACK must carry a ScoreReport"
    assert report["encounterId"] == encounter_id
    # Deterministic numbers from the scoring engine.
    assert report["esi"]["assigned"] == 3
    assert report["esi"]["expert"] in {1, 2, 3, 4, 5}
    assert report["esi"]["triageDirection"] in {"CORRECT", "OVER_TRIAGE", "UNDER_TRIAGE"}
    assert 0.0 <= report["overallPercent"] <= 100.0
    dim_keys = {d["key"] for d in report["dimensions"]}
    assert "ESI_ACCURACY" in dim_keys
    # The LLM (local stub) fills the narrative; scoring leaves it empty.
    assert report["narrative"], "feedback narrative must be filled by the LLM layer"


def test_expert_esi_not_leaked_before_feedback(client: TestClient) -> None:
    """The expert reference ESI must not be discoverable before FEEDBACK."""
    case = data_registry.load_cases(["synthetic"])[0]
    create = client.post("/api/encounters", json={"caseId": case.caseId})
    assert create.status_code == 200, create.text
    enc = create.json()
    eid = enc["encounterId"]

    # Walk to just before feedback, checking every response for leakage.
    client.post(f"/api/encounters/{eid}/advance", json={"to": "HISTORY"})
    client.post(f"/api/encounters/{eid}/history", json={"text": "What's wrong?"})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "VITALS"})
    client.post(f"/api/encounters/{eid}/vitals", json={"fields": ["heartRate"]})
    resp = client.post(f"/api/encounters/{eid}/advance", json={"to": "ESI_ASSIGNMENT"})
    pre_feedback = resp.json()
    _assert_no_expert_leak(pre_feedback)
    # Even via raw text, the expert rationale string must not appear.
    assert "esiRationale" not in resp.text


def test_advance_rejects_illegal_jump(client: TestClient) -> None:
    """Skipping ahead (CASE_LOAD -> FEEDBACK) is an illegal transition -> 409."""
    create = client.post("/api/encounters", json={"sources": ["synthetic"], "seed": 1})
    eid = create.json()["encounterId"]
    resp = client.post(f"/api/encounters/{eid}/advance", json={"to": "FEEDBACK"})
    assert resp.status_code == 409, resp.text


def test_action_in_wrong_stage_is_409(client: TestClient) -> None:
    """Assigning ESI while still in CASE_LOAD is illegal for the stage -> 409."""
    create = client.post("/api/encounters", json={"sources": ["synthetic"], "seed": 2})
    eid = create.json()["encounterId"]
    resp = client.post(f"/api/encounters/{eid}/esi", json={"esi": 2})
    assert resp.status_code == 409, resp.text


def test_unknown_encounter_is_404(client: TestClient) -> None:
    resp = client.get("/api/encounters/does-not-exist")
    assert resp.status_code == 404


def test_unknown_case_id_is_404(client: TestClient) -> None:
    resp = client.post("/api/encounters", json={"caseId": "synthetic:nope-zzz"})
    assert resp.status_code == 404


def test_unknown_source_is_400(client: TestClient) -> None:
    resp = client.post("/api/encounters", json={"sources": ["not_a_real_source"]})
    assert resp.status_code == 400


def test_unknown_vitals_field_is_400(client: TestClient) -> None:
    create = client.post("/api/encounters", json={"sources": ["synthetic"], "seed": 3})
    eid = create.json()["encounterId"]
    client.post(f"/api/encounters/{eid}/advance", json={"to": "HISTORY"})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "VITALS"})
    resp = client.post(f"/api/encounters/{eid}/vitals", json={"fields": ["not_a_vital"]})
    assert resp.status_code == 400, resp.text


def test_invalid_esi_value_is_422(client: TestClient) -> None:
    """ESI out of 1..5 is rejected by the request-body validator (422)."""
    create = client.post("/api/encounters", json={"sources": ["synthetic"], "seed": 4})
    eid = create.json()["encounterId"]
    client.post(f"/api/encounters/{eid}/advance", json={"to": "HISTORY"})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "VITALS"})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "ESI_ASSIGNMENT"})
    resp = client.post(f"/api/encounters/{eid}/esi", json={"esi": 9})
    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Per-trainee analytics: traineeId on the encounter + GET /api/analytics/{id}.
# The expert ESI of the bundled synthetic case `abdominal-pain-007` is 3, so we
# force each triage direction deterministically by the ESI the trainee assigns:
#   assign 3 -> CORRECT, assign 4 -> UNDER_TRIAGE, assign 2 -> OVER_TRIAGE
# (UNDER_TRIAGE = a higher, less-acute number than expert — the headline failure).
# ---------------------------------------------------------------------------
_FORCED_CASE = "synthetic:abdominal-pain-007"  # expert ESI == 3


def _walk_to_feedback_with_esi(
    client: TestClient, *, trainee_id: str, esi: int
) -> dict:
    """Create an encounter for the fixed case under ``trainee_id`` and walk it to
    FEEDBACK, assigning ``esi``. Returns the final FEEDBACK encounter body."""
    create = client.post(
        "/api/encounters", json={"caseId": _FORCED_CASE, "traineeId": trainee_id}
    )
    assert create.status_code == 200, create.text
    enc = create.json()
    # The opaque analytics key round-trips on the wire format.
    assert enc["traineeId"] == trainee_id
    eid = enc["encounterId"]

    client.post(f"/api/encounters/{eid}/advance", json={"to": "HISTORY"})
    client.post(f"/api/encounters/{eid}/history", json={"text": "What brings you in?"})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "VITALS"})
    client.post(f"/api/encounters/{eid}/vitals", json={"fields": ["heartRate"]})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "ESI_ASSIGNMENT"})
    client.post(f"/api/encounters/{eid}/esi", json={"esi": esi})
    client.post(f"/api/encounters/{eid}/advance", json={"to": "INTERVENTIONS"})
    client.post(f"/api/encounters/{eid}/interventions", json={"items": ["IV_ACCESS"]})
    resp = client.post(f"/api/encounters/{eid}/feedback")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_trainee_analytics_learning_curve(client: TestClient) -> None:
    """Three encounters under one traineeId yield one of each triage direction,
    and the analytics endpoint aggregates them deterministically."""
    trainee = "trainee-abc"

    correct_enc = _walk_to_feedback_with_esi(client, trainee_id=trainee, esi=3)
    under_enc = _walk_to_feedback_with_esi(client, trainee_id=trainee, esi=4)
    over_enc = _walk_to_feedback_with_esi(client, trainee_id=trainee, esi=2)

    # Sanity: directions were forced as intended (FEEDBACK reveals expert labels).
    assert correct_enc["scoreReport"]["esi"]["triageDirection"] == "CORRECT"
    assert under_enc["scoreReport"]["esi"]["triageDirection"] == "UNDER_TRIAGE"
    assert over_enc["scoreReport"]["esi"]["triageDirection"] == "OVER_TRIAGE"

    resp = client.get(f"/api/analytics/{trainee}")
    assert resp.status_code == 200, resp.text
    analytics = resp.json()

    assert analytics["traineeId"] == trainee
    assert analytics["totalEncounters"] == 3
    # One of each direction => each rate is 1/3 and they sum to 1.0.
    assert analytics["correctRate"] == pytest.approx(1 / 3)
    assert analytics["underTriageRate"] == pytest.approx(1 / 3)
    assert analytics["overTriageRate"] == pytest.approx(1 / 3)
    assert (
        analytics["underTriageRate"]
        + analytics["overTriageRate"]
        + analytics["correctRate"]
        == pytest.approx(1.0)
    )
    # |levelsOff| is 0 (correct), 1 (under), 1 (over) -> mean 2/3.
    assert analytics["meanLevelsOffAbs"] == pytest.approx(2 / 3)

    # History has one point per scored encounter, in chronological (startedAt asc)
    # order — which here is creation order: CORRECT, UNDER_TRIAGE, OVER_TRIAGE.
    history = analytics["history"]
    assert len(history) == 3
    assert [p["triageDirection"] for p in history] == [
        "CORRECT",
        "UNDER_TRIAGE",
        "OVER_TRIAGE",
    ]
    assert [p["esiAssigned"] for p in history] == [3, 4, 2]
    assert all(p["esiExpert"] == 3 for p in history)
    assert all(0.0 <= p["overallPercent"] <= 100.0 for p in history)
    # startedAt is monotonically non-decreasing (the store sorts ascending).
    starts = [p["startedAt"] for p in history]
    assert starts == sorted(starts)


def test_unknown_trainee_returns_zeroed_analytics(client: TestClient) -> None:
    """An unknown/empty trainee yields a zeroed report, never a 404."""
    resp = client.get("/api/analytics/nobody-here")
    assert resp.status_code == 200, resp.text
    analytics = resp.json()
    assert analytics == {
        "traineeId": "nobody-here",
        "totalEncounters": 0,
        "underTriageRate": 0.0,
        "overTriageRate": 0.0,
        "correctRate": 0.0,
        "meanLevelsOffAbs": 0.0,
        "history": [],
    }


def test_analytics_ignores_in_progress_encounters(client: TestClient) -> None:
    """Only FEEDBACK-stage, scored encounters count toward analytics."""
    trainee = "trainee-mixed"
    # One completed (scored) encounter.
    _walk_to_feedback_with_esi(client, trainee_id=trainee, esi=3)
    # One in-progress encounter for the same trainee (left at CASE_LOAD).
    create = client.post(
        "/api/encounters", json={"caseId": _FORCED_CASE, "traineeId": trainee}
    )
    assert create.status_code == 200
    assert create.json()["stage"] == "CASE_LOAD"

    resp = client.get(f"/api/analytics/{trainee}")
    assert resp.status_code == 200
    analytics = resp.json()
    # The unscored encounter is excluded; only the completed one is counted.
    assert analytics["totalEncounters"] == 1
    assert len(analytics["history"]) == 1
    assert analytics["correctRate"] == pytest.approx(1.0)
