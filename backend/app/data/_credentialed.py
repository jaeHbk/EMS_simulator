"""Helpers for credentialed (gitignored) sources: mimic_full, mietic.

A credentialed source loader raises :class:`CredentialedDataMissingError` with
an actionable setup hint when its directory holds no data. The registry only
calls these loaders when the source is *explicitly enabled*, so the error
surfaces exactly when an operator asked for a source but has not yet placed the
credentialed payload on disk.
"""

from __future__ import annotations

from pathlib import Path

from app.data import _mimic_format
from app.models import TriageCase


class CredentialedDataMissingError(RuntimeError):
    """Raised when an enabled credentialed source has no data on disk."""


def load_mimic_format(
    *,
    source: str,
    data_dir: Path,
    license_str: str,
    setup_hint: str,
) -> list[TriageCase]:
    """Load a MIMIC-style credentialed source, or raise an actionable error."""
    if not _mimic_format.has_data(data_dir):
        raise CredentialedDataMissingError(
            f"Source '{source}' is enabled but no credentialed data was found in "
            f"{data_dir}. {setup_hint}"
        )
    return _mimic_format.load_cases(source=source, data_dir=data_dir, license_str=license_str)
