"""In-process observability primitives — stdlib only, no network, no new deps.

Three concerns live here, all dependency-free:

1. **Structured logging** with a per-request correlation id. ``configure_logging``
   installs a small JSON-ish ``logging.Formatter`` on the app logger; a
   ``ContextVar`` (``request_id_var``) carries the current request id and a
   ``logging.Filter`` injects it onto every record so the formatter can emit it.
2. **A request-id contextvar** the HTTP middleware sets per request (see
   ``app/main.py``), defaulting to ``"-"`` outside a request.
3. **A thread-safe, in-process LLM metrics accumulator** — ``record_llm_call`` is
   called around every ``provider.complete`` (local AND cloud) so we can report
   call counts, failure counts, and latency/throughput without any external
   metrics backend.

This is deliberately in-process and best-effort: it is observability for a
single-process offline-first app, not a durable telemetry pipeline. Restarting the
process resets the accumulator. ``reset_metrics`` exists so tests can isolate state.
"""

from __future__ import annotations

import json
import logging
import threading
from contextvars import ContextVar
from dataclasses import dataclass

# --------------------------------------------------------------------------- #
# Request-id correlation
# --------------------------------------------------------------------------- #

# The current request's correlation id. Defaults to "-" so log lines emitted
# outside of an HTTP request (startup, tests) still render cleanly.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# The single logger namespace the whole app logs under. Child loggers
# ("app.<module>") propagate to it, so one handler/formatter covers everything.
_APP_LOGGER_NAME = "app"

# Sentinel attribute set on our handler so ``configure_logging`` is idempotent
# (calling it twice must not stack duplicate handlers).
_HANDLER_TAG = "_ed_triage_obs_handler"

# Standard ``logging.LogRecord`` attributes — anything NOT in this set that a
# caller passed via ``extra=`` is treated as a structured field and serialized.
_RESERVED_LOG_RECORD_ATTRS = frozenset(
    {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "taskName",
        "message",
        "asctime",
        # Injected by RequestIdFilter; rendered explicitly, not as an extra.
        "request_id",
    }
)


class RequestIdFilter(logging.Filter):
    """Injects the current ``request_id_var`` value onto each record.

    Runs as a filter (not a formatter) so the value is captured at log time on
    whatever thread/task emitted the record, and is available to the formatter as
    ``record.request_id``.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class StructuredFormatter(logging.Formatter):
    """A dependency-free structured formatter.

    Emits a single line per record:

        ``<iso-timestamp> <LEVEL> <logger> [<request_id>] <message> <extras-json>``

    where ``<extras-json>`` is a compact JSON object of any non-standard fields
    the caller attached via ``logger.info(msg, extra={...})``. It is omitted when
    there are no extras, keeping plain log lines clean. Kept to the stdlib so the
    offline build has zero logging dependencies.
    """

    def format(self, record: logging.LogRecord) -> str:
        request_id = getattr(record, "request_id", "-")
        base = (
            f"{self.formatTime(record)} {record.levelname} {record.name} "
            f"[{request_id}] {record.getMessage()}"
        )

        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED_LOG_RECORD_ATTRS and not key.startswith("_")
        }
        if extras:
            base = f"{base} {json.dumps(extras, default=str, sort_keys=True)}"

        if record.exc_info:
            base = f"{base}\n{self.formatException(record.exc_info)}"
        return base


def configure_logging(level: str = "INFO") -> None:
    """Install the structured handler + request-id filter on the app logger.

    Idempotent: a handler tagged by this module is added at most once, so calling
    this from ``create_app()`` (and again in tests) never stacks duplicate
    handlers or double-logs. Subsequent calls only re-apply the level.
    """
    logger = logging.getLogger(_APP_LOGGER_NAME)
    logger.setLevel(level.upper())
    # Logs are emitted by our own handler; don't also bubble to the root logger
    # (which would double-print if the root has its own handler configured).
    logger.propagate = False

    for handler in logger.handlers:
        if getattr(handler, _HANDLER_TAG, False):
            # Already configured: just keep the level in sync and return.
            handler.setLevel(level.upper())
            return

    handler = logging.StreamHandler()
    setattr(handler, _HANDLER_TAG, True)
    handler.setLevel(level.upper())
    handler.setFormatter(StructuredFormatter())
    handler.addFilter(RequestIdFilter())
    logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a child of the app logger so it inherits the structured handler.

    ``name`` is namespaced under ``app`` (e.g. ``get_logger("http")`` ->
    ``app.http``) unless it already starts with the app prefix.
    """
    if name == _APP_LOGGER_NAME or name.startswith(f"{_APP_LOGGER_NAME}."):
        return logging.getLogger(name)
    return logging.getLogger(f"{_APP_LOGGER_NAME}.{name}")


# --------------------------------------------------------------------------- #
# In-process LLM metrics accumulator
# --------------------------------------------------------------------------- #
#
# A module-level counter dict guarded by a lock. ``record_llm_call`` is invoked
# around every provider.complete (local and cloud), including failures, so we get
# uniform cost/latency visibility regardless of which provider served the call.
#
# Char counts approximate token usage (and therefore spend): real token counts
# would require provider-SDK usage data (e.g. Anthropic ``usage.input_tokens`` /
# OpenAI ``usage`` fields), which the offline LocalProvider cannot supply. Chars
# are a stable, network-free proxy good enough for relative latency/throughput.

@dataclass
class _LlmMetrics:
    """Mutable running totals for LLM calls. Guarded by ``_metrics_lock``."""

    calls: int = 0
    failures: int = 0
    total_latency_s: float = 0.0
    total_prompt_chars: int = 0
    total_completion_chars: int = 0


_metrics_lock = threading.Lock()
_metrics = _LlmMetrics()


def record_llm_call(
    *,
    provider: str,
    latency_s: float,
    ok: bool,
    prompt_chars: int,
    completion_chars: int,
) -> None:
    """Record one ``provider.complete`` invocation (success or failure).

    ``provider`` is the provider name (e.g. ``"local"``, ``"anthropic"``); it is
    currently aggregated into the global totals but accepted so the accumulator
    can grow a per-provider breakdown without changing call sites. ``ok=False``
    marks a failed call (after retries, for cloud) — it still counts as a call.

    Char counts approximate tokens; see the module note. Thread-safe.
    """
    with _metrics_lock:
        _metrics.calls += 1
        if not ok:
            _metrics.failures += 1
        _metrics.total_latency_s += latency_s
        _metrics.total_prompt_chars += prompt_chars
        _metrics.total_completion_chars += completion_chars


def snapshot() -> dict[str, object]:
    """Return a consistent copy of the metrics, with derived ``mean_latency_s``.

    ``mean_latency_s`` is ``total_latency_s / calls`` (0.0 when no calls yet).
    Returns a fresh dict so callers can serialize it without holding the lock.
    """
    with _metrics_lock:
        calls = _metrics.calls
        total_latency = _metrics.total_latency_s
        return {
            "calls": calls,
            "failures": _metrics.failures,
            "total_latency_s": total_latency,
            "mean_latency_s": (total_latency / calls) if calls else 0.0,
            "total_prompt_chars": _metrics.total_prompt_chars,
            "total_completion_chars": _metrics.total_completion_chars,
        }


def reset_metrics() -> None:
    """Reset the accumulator to zero. Primarily for test isolation."""
    with _metrics_lock:
        _metrics.calls = 0
        _metrics.failures = 0
        _metrics.total_latency_s = 0.0
        _metrics.total_prompt_chars = 0
        _metrics.total_completion_chars = 0
