"""Case registry: the public surface of the data module.

Dispatches to per-source loaders, enforces de-identification, and caches results.
Other modules depend ONLY on the three functions exported here (plus the Pydantic
models in ``app.models``):

    load_cases(sources) -> list[TriageCase]
    get_case(case_id)   -> TriageCase            # raises KeyError if unknown
    list_case_ids(sources) -> list[str]

Behavior:

- **Open sources** (``mimic_demo``, ``synthetic``) load with zero credentials and
  zero network. ``mimic_demo`` returns ``[]`` when its CSVs are absent.
- **Credentialed sources** (``mimic_full``, ``mietic``) are only invoked when
  explicitly listed in ``sources``. If enabled but their data is missing, the
  loader raises :class:`CredentialedDataMissingError` with a "place credentialed
  data" message — the registry lets that propagate (the operator asked for it).
  They are never auto-loaded by default.
- **De-identification is enforced here**: any case whose
  ``provenance.deidentified`` is not True is rejected with
  :class:`DeidentificationError`. This is the code-level guarantee required by
  AGENTS.md, independent of what a loader claims to set.
- Unknown source names raise :class:`UnknownSourceError`.

Results are cached per source so repeated calls are cheap and ``get_case`` can do
a global lookup across every known source.
"""

from __future__ import annotations

from collections.abc import Callable
from types import ModuleType

from app.data import KNOWN_SOURCES, OPEN_SOURCES, mietic, mimic_demo, mimic_full, synthetic
from app.data._credentialed import CredentialedDataMissingError
from app.models import TriageCase


class UnknownSourceError(ValueError):
    """Raised when an unrecognized source name is requested."""


class DeidentificationError(ValueError):
    """Raised when a loaded case is not de-identified (a hard safety failure)."""


# source name -> loader module. Each module exposes ``load() -> list[TriageCase]``.
# We hold the MODULE (not the bound function) and resolve ``.load`` lazily at call
# time, so tests can monkeypatch e.g. ``synthetic.load`` and have it take effect.
_LOADER_MODULES: dict[str, ModuleType] = {
    "mimic_demo": mimic_demo,
    "synthetic": synthetic,
    "mimic_full": mimic_full,
    "mietic": mietic,
}


def _loader_for(source: str) -> Callable[[], list[TriageCase]]:
    """Resolve the ``load`` callable for a source at call time (monkeypatch-safe)."""
    loader: Callable[[], list[TriageCase]] = _LOADER_MODULES[source].load
    return loader

# Per-source cache of de-id-validated cases.
_cache: dict[str, list[TriageCase]] = {}


def clear_cache() -> None:
    """Drop cached cases (used by tests; harmless in production)."""
    _cache.clear()


def _enforce_deidentified(cases: list[TriageCase], source: str) -> list[TriageCase]:
    """Reject any case that is not de-identified. Age bands are already enforced
    by the ``ageBand`` field type; this guards the explicit ``deidentified`` flag.
    """
    for case in cases:
        if case.provenance.deidentified is not True:
            raise DeidentificationError(
                f"Refusing case '{case.caseId}' from source '{source}': "
                "provenance.deidentified must be true."
            )
    return cases


def _load_source(source: str) -> list[TriageCase]:
    """Load (and cache) one source, enforcing de-id."""
    if source not in _LOADER_MODULES:
        raise UnknownSourceError(
            f"Unknown source '{source}'. Known sources: {', '.join(KNOWN_SOURCES)}."
        )
    if source not in _cache:
        loaded = _loader_for(source)()
        _cache[source] = _enforce_deidentified(loaded, source)
    return _cache[source]


def _default_sources() -> list[str]:
    """Open sources only — the offline default needs no credentials."""
    return list(OPEN_SOURCES)


def load_cases(sources: list[str]) -> list[TriageCase]:
    """Load every case for the given sources (de-identification enforced).

    Passing an empty list loads the open default sources (``mimic_demo`` +
    ``synthetic``). Credentialed sources load only when explicitly requested; if
    requested but empty on disk their loader raises an actionable error.
    """
    requested = sources or _default_sources()
    cases: list[TriageCase] = []
    seen_ids: set[str] = set()
    for source in requested:
        for case in _load_source(source):
            if case.caseId in seen_ids:
                continue
            seen_ids.add(case.caseId)
            cases.append(case)
    return cases


def list_case_ids(sources: list[str]) -> list[str]:
    """Return the case ids available for the given sources (load order preserved)."""
    return [case.caseId for case in load_cases(sources)]


def get_case(case_id: str) -> TriageCase:
    """Return the case with ``case_id``.

    Case ids are source-prefixed (``"<source>:<localid>"``), so we resolve the
    owning source from the id and search only that source — a case from one source
    can never be served via another. Raises ``KeyError`` if no such case exists.

    Only :class:`CredentialedDataMissingError` is swallowed (so the lookup stays
    usable offline when credentialed data is absent). A :class:`DeidentificationError`
    is NOT swallowed — it must surface, never be silently skipped.
    """
    prefix, sep, _ = case_id.partition(":")
    candidate_sources = [prefix] if sep and prefix in _LOADER_MODULES else list(KNOWN_SOURCES)
    for source in candidate_sources:
        try:
            cases = _load_source(source)
        except CredentialedDataMissingError:
            continue
        for case in cases:
            if case.caseId == case_id:
                return case
    raise KeyError(case_id)
