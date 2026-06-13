"""FastAPI application entry point for the ED Triage Trainer backend.

Wires the API router, configures CORS from settings (``CORS_ALLOW_ORIGINS``),
initializes the SQLite store at startup, and exposes a health check. The app runs
fully offline with no configuration: ``LLM_PROVIDER=local`` and the bundled
mimic_demo + synthetic sources are the defaults (see ``app/config.py``).

Run with::

    uvicorn app.main:app --reload     # serves on :8000
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app import store
from app.api import APP_VERSION
from app.api import router as api_router
from app.config import get_settings
from app.observability import configure_logging, get_logger, request_id_var

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Awaitable, Callable

# Header used to read an inbound correlation id and echo it back on the response.
_REQUEST_ID_HEADER = "X-Request-ID"

_log = get_logger("http")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize the encounter store on startup (idempotent)."""
    settings = get_settings()
    store.init_db(settings.database_url)
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    configure_logging(get_settings().log_level)

    app = FastAPI(
        title="ED Triage Trainer",
        description=(
            "Backend for the ED Triage Trainer — a training tool, not a medical "
            "device. Drives a server-enforced triage encounter state machine."
        ),
        version=APP_VERSION,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_and_timing(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Attach a correlation id and emit one structured access log per request.

        Reads an inbound ``X-Request-ID`` (or mints a ``uuid4().hex``), binds it to
        the request-id contextvar for the duration of the request, times the call,
        echoes the id back on the response, and logs method/path/status/duration.
        It NEVER logs the request body (trainee free-text / potential PII) or any
        header value beyond the correlation id.
        """
        request_id = request.headers.get(_REQUEST_ID_HEADER) or uuid4().hex
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000.0
            response.headers[_REQUEST_ID_HEADER] = request_id
            # Structured, body-free access line emitted while the request-id
            # contextvar is still set, so the RequestIdFilter stamps it on the
            # record. We log method/path/status/timing only — never the body.
            _log.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": round(duration_ms, 2),
                },
            )
            return response
        finally:
            request_id_var.reset(token)

    # Mount the SAME router under BOTH prefixes. The router itself carries no
    # prefix (see app/api/routes.py), so every route is reachable at both:
    #   * /api/...     — unversioned, back-compat alias the current frontend calls
    #                    (frontend API_BASE == "/api"); must keep working untouched.
    #   * /api/v1/...  — the versioned path for new/external clients.
    # FastAPI supports including one router under multiple prefixes.
    app.include_router(api_router, prefix="/api")
    app.include_router(api_router, prefix="/api/v1")

    # Liveness probes hit /api/health, so it MUST stay. It is defined inline on the
    # app (not the router), so we register it explicitly under both prefixes to
    # mirror the dual-mount above. /api/health is the canonical probe path.
    @app.get("/api/health", tags=["meta"])
    @app.get("/api/v1/health", tags=["meta"])
    def health() -> dict[str, str]:
        """Liveness probe. Confirms the app is up; requires no network or LLM key."""
        return {"status": "ok"}

    return app


app = create_app()
