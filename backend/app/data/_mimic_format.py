"""Shared normalization for MIMIC-style ED CSV exports.

MIMIC-IV-ED Demo (open), MIMIC-IV-ED full (credentialed) and MIETIC
(credentialed, pre-normalized to the same layout) all share the same on-disk
CSV shape:

- ``edstays.csv``   — one row per ED stay.
- ``triage.csv``    — triage vitals + chief complaint, keyed by ``stay_id``.
- ``diagnosis.csv`` — optional de-identified diagnosis groupings.

This module centralizes the parsing + de-identification so each source loader
stays a thin wrapper. De-id is enforced here: age **bands** only, never an exact
age/date/identifier, and ``provenance.deidentified = True`` on every case.
"""

from __future__ import annotations

import csv
from pathlib import Path

from app.models import TriageCase

# MIMIC ED dispositions -> our Disposition enum values.
_DISPOSITION_MAP = {
    "HOME": "DISCHARGE",
    "ADMITTED": "ADMIT",
    "TRANSFER": "TRANSFER",
    "ELOPED": "LWBS",
    "LEFT WITHOUT BEING SEEN": "LWBS",
    "LEFT AGAINST MEDICAL ADVICE": "DISCHARGE",
    "EXPIRED": "EXPIRED",
    "OTHER": "UNKNOWN",
}

# MIMIC gender -> our Sex enum values.
_SEX_MAP = {"M": "male", "F": "female"}

#: The three CSV filenames a MIMIC-style export uses.
EDSTAYS_FILE = "edstays.csv"
TRIAGE_FILE = "triage.csv"
DIAGNOSIS_FILE = "diagnosis.csv"

# Column names that, if present in a source export, indicate the data is NOT
# de-identified (direct identifiers / HIPAA Safe Harbor identifiers). MIMIC-IV-ED
# and MIETIC ship without these; their presence means an operator dropped in raw
# clinical data. We detect them and mark the case ``deidentified = False`` so the
# registry's guard rejects the whole source rather than silently serving PII.
_FORBIDDEN_IDENTIFIER_COLUMNS: frozenset[str] = frozenset(
    {
        "name",
        "firstname",
        "first_name",
        "lastname",
        "last_name",
        "patient_name",
        "ssn",
        "social_security_number",
        "mrn",
        "medical_record_number",
        "address",
        "street_address",
        "zip",
        "zipcode",
        "postal_code",
        "phone",
        "phone_number",
        "telephone",
        "email",
        "dob",
        "date_of_birth",
        "dod",
        "date_of_death",
    }
)


def _deidentification_check(*row_sets: list[dict[str, str]]) -> tuple[bool, str | None]:
    """Inspect raw CSV columns for direct identifiers.

    Returns ``(True, None)`` when no forbidden identifier columns are present,
    otherwise ``(False, reason)`` naming the offending columns. This is a positive,
    code-level verification — the loader must not merely assume the data is clean.
    """
    seen_columns: set[str] = set()
    for rows in row_sets:
        for raw in rows:
            for key in raw:
                seen_columns.add((key or "").strip().lower())
    offending = sorted(seen_columns & _FORBIDDEN_IDENTIFIER_COLUMNS)
    if offending:
        return False, (
            "source contains direct-identifier column(s): " + ", ".join(offending)
        )
    return True, None


def has_data(data_dir: Path) -> bool:
    """True if the minimum required CSVs (edstays + triage) are present."""
    return (data_dir / EDSTAYS_FILE).is_file() and (data_dir / TRIAGE_FILE).is_file()


def age_band(age: int | None) -> str:
    """Bucket an exact age into a HIPAA-Safe-Harbor band. Never emit the age.

    The bands form a clean, non-overlapping partition:
    ``0-17``, ``18-24``, then aligned 10-year bins from 25 (``25-34``, ``35-44``,
    ...), capped at ``85+`` (Safe Harbor aggregates ages 90+).
    """
    if age is None:
        return "unknown"
    if age >= 85:  # Safe Harbor: ages 90+ are aggregated; cap the top band at 85+.
        return "85+"
    if age < 18:
        return "0-17"
    if age < 25:
        return "18-24"
    low = 25 + ((age - 25) // 10) * 10
    return f"{low}-{low + 9}"


def _to_float(value: str | None) -> float | None:
    if value is None:
        return None
    text = value.strip()
    if text == "" or text.upper() in {"NA", "NAN", "NULL", "___"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _to_int(value: str | None) -> int | None:
    parsed = _to_float(value)
    return None if parsed is None else int(parsed)


def _pain_score(value: str | None) -> int | None:
    """MIMIC pain is free-text; keep only an integer 0-10."""
    parsed = _to_float(value)
    if parsed is None:
        return None
    score = int(parsed)
    return score if 0 <= score <= 10 else None


def _fahrenheit_to_c(temp_f: float | None) -> float | None:
    """MIMIC triage temperature is Fahrenheit; convert to Celsius."""
    if temp_f is None:
        return None
    if temp_f < 50:  # plausibly already Celsius
        return round(temp_f, 1)
    return round((temp_f - 32.0) * 5.0 / 9.0, 1)


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _lower_keys(row: dict[str, str]) -> dict[str, str]:
    return {(k or "").strip().lower(): v for k, v in row.items()}


def _index_by_stay(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    index: dict[str, dict[str, str]] = {}
    for raw in rows:
        row = _lower_keys(raw)
        stay_id = (row.get("stay_id") or "").strip()
        if stay_id:
            index[stay_id] = row
    return index


def _group_diagnoses(rows: list[dict[str, str]]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for raw in rows:
        row = _lower_keys(raw)
        stay_id = (row.get("stay_id") or "").strip()
        title = (row.get("icd_title") or row.get("icd_code") or "").strip()
        if stay_id and title:
            grouped.setdefault(stay_id, []).append(title)
    return grouped


def _esi_from_acuity(acuity: str | None) -> int:
    """MIMIC triage `acuity` is the ESI level (1-5). Default to 3 if missing."""
    parsed = _to_int(acuity)
    return parsed if (parsed is not None and 1 <= parsed <= 5) else 3


def load_cases(source: str, data_dir: Path, license_str: str) -> list[TriageCase]:
    """Normalize a MIMIC-style CSV export directory into ``TriageCase`` objects.

    Caller is responsible for checking :func:`has_data` first; if the required
    CSVs are absent this returns ``[]``.
    """
    if not has_data(data_dir):
        return []

    edstays = _read_csv(data_dir / EDSTAYS_FILE)
    triage_rows = _read_csv(data_dir / TRIAGE_FILE)
    triage_by_stay = _index_by_stay(triage_rows)
    diagnosis_path = data_dir / DIAGNOSIS_FILE
    diagnosis_rows = _read_csv(diagnosis_path) if diagnosis_path.is_file() else []
    diagnoses_by_stay = _group_diagnoses(diagnosis_rows)

    # Positively verify de-identification from the real source columns. If a
    # direct identifier is present we still build the cases but stamp
    # deidentified=False, so the registry guard rejects the whole source.
    is_deidentified, deid_reason = _deidentification_check(edstays, triage_rows, diagnosis_rows)
    source_ref_suffix = "" if is_deidentified else f" [NON-DEIDENTIFIED: {deid_reason}]"

    cases: list[TriageCase] = []
    for raw_stay in edstays:
        stay = _lower_keys(raw_stay)
        stay_id = (stay.get("stay_id") or "").strip()
        if not stay_id:
            continue
        triage = triage_by_stay.get(stay_id, {})

        disposition_raw = (stay.get("disposition") or "").strip().upper()
        chief_complaint = (triage.get("chiefcomplaint") or "").strip() or "Unspecified complaint"

        payload: dict[str, object] = {
            "caseId": f"{source}:{stay_id}",
            "source": source,
            "demographics": {
                "ageBand": age_band(_to_int(stay.get("anchor_age"))),
                "sex": _SEX_MAP.get((stay.get("gender") or "").strip().upper(), "unknown"),
            },
            "presentation": {
                "chiefComplaint": chief_complaint,
                "history": {
                    "hpi": None,
                    "pmh": [],
                    "medications": [],
                    "allergies": [],
                    "socialHistory": None,
                    "redFlags": [],
                },
                "groundTruthVitals": {
                    "heartRate": _to_float(triage.get("heartrate")),
                    "systolicBP": _to_float(triage.get("sbp")),
                    "diastolicBP": _to_float(triage.get("dbp")),
                    "respiratoryRate": _to_float(triage.get("resprate")),
                    "spo2": _to_float(triage.get("o2sat")),
                    "temperatureC": _fahrenheit_to_c(_to_float(triage.get("temperature"))),
                    "painScore": _pain_score(triage.get("pain")),
                    "glucose": None,
                    "avpu": None,
                },
            },
            "expert": {
                "esi": _esi_from_acuity(triage.get("acuity")),
                "esiRationale": "Reference acuity from the triage record.",
                "criticalInterventions": [],
                # resourcesPredicted omitted: the schema requires an integer when
                # present, so we leave it absent rather than emit null.
            },
            "outcome": {
                "disposition": _DISPOSITION_MAP.get(disposition_raw, "UNKNOWN"),
                # edLengthOfStayMinutes omitted (integer-or-absent per schema).
                "diagnosisCategories": diagnoses_by_stay.get(stay_id, []),
            },
            # MIMIC supplies a triage ESI, triage vitals, and a real disposition,
            # but no curated red flags and no expert critical interventions. Declare
            # only the dimensions this source can actually grade, so the engine
            # excludes HISTORY_COMPLETENESS / INTERVENTION_RECOGNITION (which would
            # otherwise grade against absent data) from scoring and weighting.
            "gradableDimensions": [
                "ESI_ACCURACY",
                "VITALS_ACQUISITION",
                "OUTCOME_ALIGNMENT",
            ],
            "provenance": {
                "license": license_str,
                "deidentified": is_deidentified,
                "sourceRef": f"{source} export, stay_id={stay_id}{source_ref_suffix}",
            },
        }
        cases.append(TriageCase.model_validate(payload))
    return cases
