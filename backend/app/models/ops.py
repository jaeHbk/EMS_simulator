"""Operational/monitoring model — NOT part of the cross-language contract.

``OperationalStats`` is the response body of ``GET /stats`` (reachable at both
``/api/stats`` and ``/api/v1/stats``). Unlike the models in this package's other
modules, it does NOT mirror a ``shared/schemas/*.json`` schema and is NOT mirrored
in ``frontend/src/api/contract.ts`` — the React app never consumes it. It exists
purely for deploy/monitoring visibility (ops dashboards, readiness checks).

It carries aggregates only: counts and in-process LLM metrics. By design it
exposes NO PII and NO per-encounter content (no encounter ids, history, vitals, or
expert labels) — just the total encounter count, the LLM metrics snapshot, and the
app version.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class OperationalStats(BaseModel):
    """Aggregate operational stats for ``GET /stats``. Counts + metrics only."""

    model_config = ConfigDict(extra="forbid")

    encounters: int = Field(
        ge=0,
        description="Total encounters currently persisted in the store (count only).",
    )
    llm: dict[str, object] = Field(
        description=(
            "In-process LLM metrics snapshot (calls, failures, latency, char "
            "throughput) from app.observability.snapshot(). Aggregates only — a "
            "plain dict since this is ops-only and not a typed contract surface."
        ),
    )
    version: str = Field(
        description="Backend app version (matches the FastAPI app version).",
    )
