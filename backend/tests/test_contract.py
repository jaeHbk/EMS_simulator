"""Contract parity test — the cross-language guarantee.

The JSON Schemas in ``shared/schemas/`` are the single source of truth for every
value that crosses the Python<->TypeScript boundary. This test loads each schema
with ``jsonschema`` and validates that the *real* Python objects produced by the
backend modules conform to them:

* (a) a ``TriageCase`` from the data module,
* (b) an ``Encounter`` produced by the sim state machine, and
* (c) a ``ScoreReport`` from the deterministic scoring engine.

If a Pydantic model and its schema drift, this fails — that is the parity it
guards. The check is meaningful, not trivial: it validates fully populated
objects (an encounter walked to FEEDBACK with vitals, ESI, interventions, and a
nested score report) against ``additionalProperties: false`` schemas, so an extra
or renamed field is caught in either direction.

All offline: no network, no API key, no credentialed data.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema.validators import Draft7Validator, RefResolver

from app import scoring, sim
from app.data import OPEN_SOURCES
from app.data import registry as data_registry
from app.models import Encounter, Stage, TriageCase

# shared/schemas lives at repo_root/shared/schemas; this file is at
# repo_root/backend/tests/test_contract.py -> parents[2] == repo_root.
SCHEMA_DIR: Path = Path(__file__).resolve().parents[2] / "shared" / "schemas"

_SCHEMA_FILES = {
    "triage-case": "triage-case.schema.json",
    "encounter": "encounter.schema.json",
    "score-report": "score-report.schema.json",
}


def _load_schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMA_DIR / _SCHEMA_FILES[name]).read_text())


def _all_schemas() -> dict[str, dict[str, Any]]:
    return {name: _load_schema(name) for name in _SCHEMA_FILES}


def _make_resolver(schema: dict[str, Any]) -> RefResolver:
    """Build a resolver that resolves cross-schema ``$ref``s both by ``$id`` URI
    (e.g. ``https://ed-triage-trainer/schemas/triage-case.schema.json``) and by
    bare filename (e.g. ``triage-case.schema.json``), which is how the encounter
    schema references the others.
    """
    store: dict[str, dict[str, Any]] = {}
    for parsed in _all_schemas().values():
        schema_id = parsed.get("$id")
        if schema_id:
            store[schema_id] = parsed
    # Also key every schema by its bare filename for the relative refs.
    for filename in _SCHEMA_FILES.values():
        parsed = json.loads((SCHEMA_DIR / filename).read_text())
        store[filename] = parsed
    return RefResolver(base_uri=schema.get("$id", ""), referrer=schema, store=store)


def _validate(name: str, instance: dict[str, Any]) -> None:
    schema = _load_schema(name)
    resolver = _make_resolver(schema)
    Draft7Validator.check_schema(schema)
    validator = Draft7Validator(schema, resolver=resolver)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path))
    assert not errors, "schema violations:\n" + "\n".join(
        f"  - {'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}" for e in errors
    )


# ---------------------------------------------------------------------------
# Fixtures: real objects from the real modules.
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _clean_registry() -> None:
    data_registry.clear_cache()
    yield
    data_registry.clear_cache()


@pytest.fixture
def sample_case() -> TriageCase:
    """A real TriageCase from the bundled open sources."""
    cases = data_registry.load_cases(list(OPEN_SOURCES))
    assert cases, "expected bundled open-source cases to load offline"
    # Pick one with an outcome and red flags so the downstream score report is rich.
    rich = next(
        (c for c in cases if c.outcome is not None and c.presentation.history.redFlags),
        None,
    )
    return rich or cases[0]


def _walk_to_feedback(case: TriageCase) -> tuple[Encounter, Any]:
    """Drive a full encounter through the sim machine and score it.

    Returns the FEEDBACK-stage encounter (with a nested ScoreReport attached) and
    the ScoreReport, so the test can validate both against their schemas.
    """
    enc = sim.create_encounter(case)
    from app.models import HistoryTurn
    from app.models.encounter import Role

    enc = sim.advance(enc, Stage.HISTORY)
    enc = sim.record_history_turn(enc, HistoryTurn(role=Role.trainee, text="What brings you in?"))
    enc = sim.record_history_turn(enc, HistoryTurn(role=Role.patient, text="I feel unwell."))
    enc = sim.advance(enc, Stage.VITALS)
    enc = sim.measure_vitals(enc, case, ["heartRate", "systolicBP", "spo2"])
    enc = sim.advance(enc, Stage.ESI_ASSIGNMENT)
    enc = sim.assign_esi(enc, 3)
    enc = sim.advance(enc, Stage.INTERVENTIONS)
    enc = sim.order_interventions(enc, ["ECG", "IV_ACCESS"])
    enc = sim.advance(enc, Stage.FEEDBACK)
    report = scoring.score(enc, case)
    enc.scoreReport = report
    return enc, report


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_schemas_are_valid_draft7() -> None:
    for name in _SCHEMA_FILES:
        Draft7Validator.check_schema(_load_schema(name))


def test_triage_case_conforms_to_schema(sample_case: TriageCase) -> None:
    instance = sample_case.model_dump(mode="json")
    _validate("triage-case", instance)
    # Meaningful, not trivial: the case must carry the fields the contract requires.
    assert instance["caseId"]
    assert instance["expert"]["esi"] in {1, 2, 3, 4, 5}
    assert instance["provenance"]["deidentified"] is True


def test_encounter_conforms_to_schema(sample_case: TriageCase) -> None:
    enc, _ = _walk_to_feedback(sample_case)
    instance = enc.model_dump(mode="json")
    _validate("encounter", instance)
    # The fully-walked encounter exercises history, vitals, esi, interventions, and
    # a nested score report — so the conformance check is substantive.
    assert instance["stage"] == "FEEDBACK"
    assert instance["history"], "history transcript should be populated"
    assert instance["esiAssigned"] == 3
    assert instance["interventionsOrdered"] == ["ECG", "IV_ACCESS"]
    assert instance["scoreReport"] is not None


def test_score_report_conforms_to_schema(sample_case: TriageCase) -> None:
    _, report = _walk_to_feedback(sample_case)
    instance = report.model_dump(mode="json")
    _validate("score-report", instance)
    # ESI accuracy must be present and weighted; the headline metric is a real enum.
    keys = {d["key"] for d in instance["dimensions"]}
    assert "ESI_ACCURACY" in keys
    assert instance["esi"]["triageDirection"] in {"CORRECT", "OVER_TRIAGE", "UNDER_TRIAGE"}
    assert 0.0 <= instance["overallPercent"] <= 100.0


def test_nested_encounter_score_report_conforms_via_encounter_schema(
    sample_case: TriageCase,
) -> None:
    """The encounter schema embeds the score-report schema by ``$ref``; a populated
    nested report must validate through the encounter schema, proving the
    cross-schema reference resolves and stays consistent.
    """
    enc, _ = _walk_to_feedback(sample_case)
    instance = enc.model_dump(mode="json")
    assert instance["scoreReport"] is not None
    _validate("encounter", instance)


def test_every_bundled_case_conforms(sample_case: TriageCase) -> None:
    """Validate *every* bundled case, not just one, so a single bad case can't hide."""
    for case in data_registry.load_cases(list(OPEN_SOURCES)):
        _validate("triage-case", case.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Real MIMIC-loader path: the synthetic seeds always populate optional fields,
# so they can't catch schema<->model nullability drift on the MIMIC formatter
# (which leaves resourcesPredicted / edLengthOfStayMinutes unset). Exercise the
# real loader against a tiny CSV fixture so that path is actually validated.
# ---------------------------------------------------------------------------
def _write_mimic_fixture(data_dir: Path, *, extra_edstays_col: str | None = None) -> None:
    edstays_cols = "stay_id,gender,anchor_age,disposition"
    edstays_row = "1001,M,67,ADMITTED"
    if extra_edstays_col is not None:
        edstays_cols += f",{extra_edstays_col}"
        edstays_row += ",SOME_VALUE"
    (data_dir / "edstays.csv").write_text(edstays_cols + "\n" + edstays_row + "\n")
    (data_dir / "triage.csv").write_text(
        "stay_id,chiefcomplaint,heartrate,sbp,dbp,resprate,o2sat,temperature,pain,acuity\n"
        "1001,Chest pain,104,138,82,20,96,99.1,6,2\n"
    )


def test_mimic_loaded_case_conforms_to_schema(tmp_path: Path) -> None:
    """A case built by the real MIMIC formatter (optional fields unset) must still
    validate against the triage-case schema — the drift class the seeds hide."""
    from app.data import _mimic_format

    _write_mimic_fixture(tmp_path)
    cases = _mimic_format.load_cases(
        source="mimic_demo", data_dir=tmp_path, license_str="PhysioNet"
    )
    assert len(cases) == 1
    instance = cases[0].model_dump(mode="json")
    _validate("triage-case", instance)
    # The optional fields the formatter leaves unset serialize in a schema-valid way.
    assert instance["expert"]["esi"] == 2
    assert instance["provenance"]["deidentified"] is True
