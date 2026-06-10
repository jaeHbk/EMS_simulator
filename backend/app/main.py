"""FastAPI application entry point for the ED Triage Trainer backend.

Wires the API router, configures CORS from settings (``CORS_ALLOW_ORIGINS``),
initializes the SQLite store at startup, and exposes a health check. The app runs
fully offline with no configuration: ``LLM_PROVIDER=local`` and the bundled
mimic_demo + synthetic sources are the defaults (see ``app/config.py``).

Run with::

    uvicorn app.main:app --reload     # serves on :8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import store
from app.api import router as api_router
from app.config import get_settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize the encounter store on startup (idempotent)."""
    settings = get_settings()
    store.init_db(settings.database_url)
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(
        title="ED Triage Trainer",
        description=(
            "Backend for the ED Triage Trainer — a training tool, not a medical "
            "device. Drives a server-enforced triage encounter state machine."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.get("/api/health", tags=["meta"])
    def health() -> dict[str, str]:
        """Liveness probe. Confirms the app is up; requires no network or LLM key."""
        return {"status": "ok"}

    return app


app = create_app()
