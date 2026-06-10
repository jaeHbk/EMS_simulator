"""MIETIC source loader (credentialed).

MIETIC case data is credentialed PhysioNet data; its payload is **never
committed to git** (the directory is ``.gitignore``d). An operator must place
the data on disk after completing the required access steps.

Contract (see MODULE_INTERFACES.md): ``load()`` reads from the source dir if
credentialed data is present, otherwise raises a clear, actionable error. The
registry only invokes credentialed loaders when the source is *explicitly
enabled*; an enabled-but-empty source surfaces the "place credentialed data"
message instead of silently returning nothing.

The on-disk format is normalized to the same MIMIC-style CSV layout
(``edstays.csv`` + ``triage.csv`` + optional ``diagnosis.csv``) so the shared
loader can produce ``TriageCase`` objects without source-specific branching.
"""

from __future__ import annotations

from app.data import SOURCES_DIR
from app.data._credentialed import CredentialedDataMissingError, load_mimic_format
from app.models import TriageCase

_DATA_DIR = SOURCES_DIR / "mietic"
_LICENSE = "PhysioNet Credentialed Health Data License (MIETIC)"

__all__ = ["CredentialedDataMissingError", "load"]


def load() -> list[TriageCase]:
    """Load MIETIC cases, or raise if the credentialed data is absent."""
    return load_mimic_format(
        source="mietic",
        data_dir=_DATA_DIR,
        license_str=_LICENSE,
        setup_hint=(
            "MIETIC data is credentialed. Obtain access via PhysioNet "
            "(credentialed account + signed DUA), then place the normalized "
            "edstays.csv, triage.csv and (optionally) diagnosis.csv in this "
            "directory. See the README in backend/data/sources/mietic/."
        ),
    )
