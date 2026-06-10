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


def has_data(data_dir: Path) -> bool:
    """True if the minimum required CSVs (edstays + triage) are present."""
    return (data_dir / EDSTAYS_FILE).is_file() and (data_dir / TRIAGE_FILE).is_file()


def age_band(age: int | None) -> str:
    """Bucket an exact age into a HIPAA-Safe-Harbor band. Never emit the age."""
    if age is None:
        return "unknown"
    if age >= 85:  # Safe Harbor: ages 90+ are aggregated; cap the top band at 85+.
        return "85+"
    if age < 18:
        return "0-17"
    if age < 25:
        return "18-24"
    low = (age // 10) * 10
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
    triage_by_stay = _index_by_stay(_read_csv(data_dir / TRIAGE_FILE))
    diagnosis_path = data_dir / DIAGNOSIS_FILE
    diagnoses_by_stay = (
        _group_diagnoses(_read_csv(diagnosis_path)) if diagnosis_path.is_file() else {}
    )

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
                "resourcesPredicted": None,
            },
            "outcome": {
                "disposition": _DISPOSITION_MAP.get(disposition_raw, "UNKNOWN"),
                "edLengthOfStayMinutes": None,
                "diagnosisCategories": diagnoses_by_stay.get(stay_id, []),
            },
            "provenance": {
                "license": license_str,
                "deidentified": True,
                "sourceRef": f"{source} export, stay_id={stay_id}",
            },
        }
        cases.append(TriageCase.model_validate(payload))
    return cases
