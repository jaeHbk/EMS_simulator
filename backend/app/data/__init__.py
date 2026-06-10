"""Data source loaders that normalize every source into a `TriageCase`.

Every data source (mimic_demo, synthetic, mimic_full, mietic) is read by a
per-source loader exposing `load() -> list[TriageCase]`. The registry
(`app.data.registry`) dispatches to those loaders, enforces de-identification,
and caches results.

Design rules this module obeys (see AGENTS.md / CLAUDE.md):
- **Offline-first.** No loader requires network or an API key. `mimic_demo`
  returns `[]` when its CSVs are absent; the synthetic generator + bundled seed
  JSON always work.
- **De-identification enforced in code.** Any case whose
  `provenance.deidentified` is False is rejected. Demographics carry age *bands*
  only, never exact ages, dates, or identifiers.
- **No credentialed data in git.** `mimic_full` / `mietic` read from their dirs
  only when the operator has placed credentialed data there; when enabled but
  empty they raise a clear, actionable "place credentialed data" error.
"""

from __future__ import annotations

from pathlib import Path

# Absolute path to backend/data/sources, resolved relative to this package so
# loaders work regardless of the process working directory.
#   app/data/__init__.py -> parents[0]=app/data, [1]=app, [2]=backend
SOURCES_DIR: Path = Path(__file__).resolve().parents[2] / "data" / "sources"

#: Sources that are committed to git and run with zero credentials/network.
OPEN_SOURCES: tuple[str, ...] = ("mimic_demo", "synthetic")

#: Sources that require the operator to place credentialed data on disk.
CREDENTIALED_SOURCES: tuple[str, ...] = ("mimic_full", "mietic")

#: All sources this module knows how to load.
KNOWN_SOURCES: tuple[str, ...] = OPEN_SOURCES + CREDENTIALED_SOURCES

__all__ = [
    "CREDENTIALED_SOURCES",
    "KNOWN_SOURCES",
    "OPEN_SOURCES",
    "SOURCES_DIR",
]
