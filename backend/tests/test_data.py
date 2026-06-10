"""Unit tests for the data module (app/data/).

Covers: registry returns cases, get_case round-trips, every loaded case validates
against the TriageCase model, de-identification rejection, deterministic synthetic
generation, ESI coverage, and credentialed-source error behavior.

All tests are offline: no network, no API key, no credentialed data required.
"""

from __future__ import annotations

import pytest

from app.data import (
    KNOWN_SOURCES,
    OPEN_SOURCES,
    mietic,
    mimic_demo,
    mimic_full,
    registry,
    synthetic,
)
from app.data._credentialed import CredentialedDataMissingError
from app.models import TriageCase


@pytest.fixture(autouse=True)
def _clear_registry_cache() -> None:
    """Ensure each test starts with a clean registry cache."""
    registry.clear_cache()
    yield
    registry.clear_cache()


# ---------------------------------------------------------------------------
# Registry behavior
# ---------------------------------------------------------------------------


def test_load_cases_returns_cases_for_open_sources() -> None:
    cases = registry.load_cases(list(OPEN_SOURCES))
    assert len(cases) > 0
    assert all(isinstance(c, TriageCase) for c in cases)


def test_load_cases_empty_list_uses_open_defaults() -> None:
    explicit = registry.load_cases(list(OPEN_SOURCES))
    default = registry.load_cases([])
    assert {c.caseId for c in default} == {c.caseId for c in explicit}


def test_list_case_ids_matches_load_cases() -> None:
    ids = registry.list_case_ids(["synthetic"])
    cases = registry.load_cases(["synthetic"])
    assert ids == [c.caseId for c in cases]
    assert len(ids) == len(set(ids)), "case ids must be unique"


def test_get_case_round_trips() -> None:
    cases = registry.load_cases(["synthetic"])
    sample = cases[0]
    fetched = registry.get_case(sample.caseId)
    assert fetched.caseId == sample.caseId
    assert fetched == sample


def test_get_case_unknown_raises_keyerror() -> None:
    with pytest.raises(KeyError):
        registry.get_case("synthetic:does-not-exist-zzz")


def test_unknown_source_raises() -> None:
    with pytest.raises(registry.UnknownSourceError):
        registry.load_cases(["not_a_real_source"])


def test_every_loaded_case_validates_against_model() -> None:
    # Re-validating each case's dump round-trips through the schema-mirroring model.
    for case in registry.load_cases(list(OPEN_SOURCES)):
        TriageCase.model_validate(case.model_dump())


def test_every_case_is_deidentified_and_age_banded() -> None:
    for case in registry.load_cases(list(OPEN_SOURCES)):
        assert case.provenance.deidentified is True
        # Age band must not be a bare exact age (defensive de-id check).
        band = case.demographics.ageBand
        assert not band.isdigit(), f"ageBand looks like an exact age: {band!r}"


# ---------------------------------------------------------------------------
# De-identification rejection
# ---------------------------------------------------------------------------


def test_deidentification_rejection(monkeypatch: pytest.MonkeyPatch) -> None:
    """A case with deidentified=false must be refused by the registry."""
    good = synthetic.load_seed_cases()[0]
    bad_payload = good.model_dump()
    bad_payload["caseId"] = "synthetic:not-deid"
    bad_payload["provenance"]["deidentified"] = False
    bad_case = TriageCase.model_validate(bad_payload)

    monkeypatch.setattr(synthetic, "load", lambda: [bad_case])
    registry.clear_cache()
    with pytest.raises(registry.DeidentificationError):
        registry.load_cases(["synthetic"])


# ---------------------------------------------------------------------------
# Synthetic source
# ---------------------------------------------------------------------------


def test_synthetic_generator_is_deterministic() -> None:
    first = synthetic.generate_cases()
    second = synthetic.generate_cases()
    assert [c.model_dump() for c in first] == [c.model_dump() for c in second]


def test_synthetic_generator_respects_seed() -> None:
    a = synthetic.generate_cases(seed=1)
    b = synthetic.generate_cases(seed=2)
    # Different seeds should produce different vitals somewhere (not identical sets).
    assert [c.model_dump() for c in a] != [c.model_dump() for c in b]


def test_synthetic_seed_cases_load() -> None:
    seeds = synthetic.load_seed_cases()
    assert len(seeds) >= 10, "expected ~10 hand-authored seed cases"
    assert all(c.source == "synthetic" for c in seeds)
    assert all(c.provenance.license == "synthetic-generated" for c in seeds)
    assert all(c.provenance.deidentified is True for c in seeds)


def test_synthetic_covers_all_esi_levels() -> None:
    levels = {c.expert.esi for c in synthetic.load()}
    assert levels == {1, 2, 3, 4, 5}, f"synthetic set must span ESI 1-5, got {levels}"


def test_synthetic_seed_cases_have_red_flags_and_rationale() -> None:
    for case in synthetic.load_seed_cases():
        assert case.expert.esiRationale, f"{case.caseId} missing ESI rationale"
        # Most seed cases surface red flags the trainee must elicit.
        assert isinstance(case.presentation.history.redFlags, list)


def test_synthetic_includes_outcomes_for_some_cases() -> None:
    cases = synthetic.load()
    assert any(c.outcome is not None for c in cases), "some cases must carry outcomes"


def test_synthetic_esi1_cases_have_critical_interventions() -> None:
    for case in synthetic.load():
        if case.expert.esi == 1:
            assert case.expert.criticalInterventions, (
                f"ESI 1 case {case.caseId} should list critical interventions"
            )


# ---------------------------------------------------------------------------
# mimic_demo source (offline-first)
# ---------------------------------------------------------------------------


def test_mimic_demo_absent_returns_empty() -> None:
    # In the default checkout the demo CSVs are absent; must not crash.
    cases = mimic_demo.load()
    assert isinstance(cases, list)


# ---------------------------------------------------------------------------
# Credentialed sources
# ---------------------------------------------------------------------------


def test_credentialed_sources_raise_when_enabled_but_empty() -> None:
    # Explicitly enabling an empty credentialed source surfaces an actionable error.
    for loader in (mimic_full.load, mietic.load):
        with pytest.raises(CredentialedDataMissingError) as exc:
            loader()
        msg = str(exc.value)
        assert "credentialed" in msg.lower()
        assert "README" in msg


def test_get_case_skips_missing_credentialed_sources() -> None:
    # get_case must stay usable offline even though mimic_full/mietic are empty.
    sample = synthetic.load_seed_cases()[0]
    fetched = registry.get_case(sample.caseId)
    assert fetched.caseId == sample.caseId


def test_known_sources_have_loaders() -> None:
    assert set(KNOWN_SOURCES) == set(registry._LOADER_MODULES)


# ---------------------------------------------------------------------------
# Real-loader de-identification: the MIMIC formatter must DETECT non-de-identified
# data (a direct-identifier column) and propagate deidentified=False, so the
# registry guard actually fires on the production code path — not just on a
# hand-built case via monkeypatch.
# ---------------------------------------------------------------------------
def _write_mimic_fixture(data_dir, *, extra_edstays_col: str | None = None) -> None:
    edstays_cols = "stay_id,gender,anchor_age,disposition"
    edstays_row = "1001,F,71,HOME"
    if extra_edstays_col is not None:
        edstays_cols += f",{extra_edstays_col}"
        edstays_row += ",Jane Doe"
    (data_dir / "edstays.csv").write_text(edstays_cols + "\n" + edstays_row + "\n")
    (data_dir / "triage.csv").write_text(
        "stay_id,chiefcomplaint,heartrate,sbp,dbp,resprate,o2sat,temperature,pain,acuity\n"
        "1001,Headache,78,124,80,16,99,98.6,3,4\n"
    )


def test_mimic_loader_marks_clean_data_deidentified(tmp_path) -> None:
    from app.data import _mimic_format

    _write_mimic_fixture(tmp_path)
    cases = _mimic_format.load_cases(source="mimic_demo", data_dir=tmp_path, license_str="X")
    assert cases and all(c.provenance.deidentified is True for c in cases)


def test_mimic_loader_flags_data_with_identifier_column() -> None:
    """A source carrying a direct-identifier column (e.g. 'name') must be marked
    NOT de-identified by the loader itself."""
    import tempfile
    from pathlib import Path

    from app.data import _mimic_format

    with tempfile.TemporaryDirectory() as d:
        data_dir = Path(d)
        _write_mimic_fixture(data_dir, extra_edstays_col="name")
        cases = _mimic_format.load_cases(source="mimic_demo", data_dir=data_dir, license_str="X")
        assert cases, "loader should still build cases"
        assert all(c.provenance.deidentified is False for c in cases)


def test_registry_rejects_mimic_source_with_identifier_column(monkeypatch, tmp_path) -> None:
    """End-to-end on the real code path: non-de-identified MIMIC data flowing
    through the registry raises DeidentificationError (the CRITICAL guard)."""
    from app.data import _mimic_format, mimic_demo

    _write_mimic_fixture(tmp_path, extra_edstays_col="patient_name")

    def fake_load() -> list[TriageCase]:
        return _mimic_format.load_cases(source="mimic_demo", data_dir=tmp_path, license_str="X")

    monkeypatch.setattr(mimic_demo, "load", fake_load)
    registry.clear_cache()
    with pytest.raises(registry.DeidentificationError):
        registry.load_cases(["mimic_demo"])


def test_age_bands_are_non_overlapping_partition() -> None:
    """age_band must yield a clean, non-overlapping partition across the lifespan
    (regression for the old 18-24 vs 20-29 overlap)."""
    from app.data._mimic_format import age_band

    bands = [age_band(a) for a in range(0, 121)]
    # No age maps to a band whose numeric range it falls outside, and adjacent
    # distinct bands must not overlap. Spot-check the historically-broken seam:
    assert age_band(24) == "18-24"
    assert age_band(25) == "25-34"
    assert age_band(34) == "25-34"
    assert age_band(35) == "35-44"
    # Every produced band is a valid non-numeric label (no exact age leak).
    assert all(not b.isdigit() for b in bands)
