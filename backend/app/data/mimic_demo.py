"""MIMIC-IV-ED Demo source loader (open-access).

Reads the PhysioNet *MIMIC-IV-ED Demo* CSVs from
``backend/data/sources/mimic_demo/`` when they are present and normalizes each
ED stay into a :class:`TriageCase`. The demo subset is open-access (PhysioNet
Open Data Commons) and may be committed to git.

**Offline-first:** if the CSVs are absent (the default checkout state), ``load``
returns ``[]`` rather than crashing. The synthetic source guarantees the app
always has cases.

**De-identification:** MIMIC is already de-identified by PhysioNet, but this
loader enforces de-id in code anyway — it emits *age bands* only (never an exact
age, date, or identifier) and stamps ``provenance.deidentified = True`` (the
registry additionally rejects any case whose ``deidentified`` is False).

Expected filenames (documented in the README in the source directory):

- ``edstays.csv``   — one row per ED stay (stay_id, subject_id, gender,
  disposition, optional anchor_age).
- ``triage.csv``    — triage vitals + chief complaint + acuity, keyed by stay_id.
- ``diagnosis.csv`` — (optional) ED diagnoses, keyed by stay_id.
"""

from __future__ import annotations

from app.data import SOURCES_DIR, _mimic_format
from app.models import TriageCase

_DATA_DIR = SOURCES_DIR / "mimic_demo"
_LICENSE = "PhysioNet Open Data Commons (MIMIC-IV-ED Demo)"

__all__ = ["load"]


def load() -> list[TriageCase]:
    """Load MIMIC-IV-ED Demo cases if the CSVs are present, else ``[]``."""
    return _mimic_format.load_cases(
        source="mimic_demo",
        data_dir=_DATA_DIR,
        license_str=_LICENSE,
    )
