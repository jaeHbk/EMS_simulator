"""MIMIC-IV-ED **full** source loader (credentialed).

The full MIMIC-IV-ED dataset requires a PhysioNet credentialed account and a
signed Data Use Agreement. Its payload is **never committed to git** (the
directory is ``.gitignore``d); an operator must place the CSVs on disk.

Contract (see MODULE_INTERFACES.md): ``load()`` reads from the source dir if
credentialed data is present, otherwise raises a clear, actionable error. The
registry only invokes credentialed loaders when the source is *explicitly
enabled*; an enabled-but-empty source surfaces the "place credentialed data"
message instead of silently returning nothing.

The on-disk format mirrors the open demo (``edstays.csv`` + ``triage.csv`` +
optional ``diagnosis.csv``), so the demo loader's normalization is reused.
"""

from __future__ import annotations

from app.data import SOURCES_DIR
from app.data._credentialed import CredentialedDataMissingError, load_mimic_format
from app.models import TriageCase

_DATA_DIR = SOURCES_DIR / "mimic_full"
_LICENSE = "PhysioNet Credentialed Health Data License (MIMIC-IV-ED)"

__all__ = ["CredentialedDataMissingError", "load"]


def load() -> list[TriageCase]:
    """Load full MIMIC-IV-ED cases, or raise if the credentialed data is absent."""
    return load_mimic_format(
        source="mimic_full",
        data_dir=_DATA_DIR,
        license_str=_LICENSE,
        setup_hint=(
            "MIMIC-IV-ED full data is credentialed. Obtain access via PhysioNet "
            "(credentialed account + signed DUA), then place edstays.csv, "
            "triage.csv and (optionally) diagnosis.csv in this directory. "
            "See the README in backend/data/sources/mimic_full/."
        ),
    )
