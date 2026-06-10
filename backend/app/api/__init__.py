"""HTTP API layer for the ED Triage Trainer.

This package is intentionally thin: every route validates a small request body,
calls the owning module (``data`` / ``sim`` / ``scoring`` / ``llm`` / ``store``),
and returns the full ``Encounter`` wire format. No clinical, scoring, or
state-machine logic lives here — that all belongs to the modules behind the seam
(see docs/MODULE_INTERFACES.md).

Public surface:
    router : APIRouter mounted under ``/api`` by ``app.main``.
"""

from app.api.routes import router

__all__ = ["router"]
