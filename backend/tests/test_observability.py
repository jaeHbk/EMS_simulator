"""Unit tests for app/observability.py — stdlib-only logging + LLM metrics.

No network and no new deps: these exercise the structured logging plumbing
(idempotent handler install, request-id injection) and the in-process LLM metrics
accumulator (counting, latency math, reset) in isolation.
"""

from __future__ import annotations

import logging

import pytest

from app.observability import (
    RequestIdFilter,
    StructuredFormatter,
    configure_logging,
    get_logger,
    record_llm_call,
    request_id_var,
    reset_metrics,
    snapshot,
)


@pytest.fixture(autouse=True)
def _reset() -> None:
    """Keep the shared accumulator clean across tests in this module."""
    reset_metrics()


# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #


def test_configure_logging_is_idempotent() -> None:
    """Calling configure_logging twice must not stack duplicate handlers."""
    logger = logging.getLogger("app")
    # Start from a known state for this assertion.
    logger.handlers.clear()

    configure_logging("INFO")
    after_first = len(logger.handlers)
    configure_logging("INFO")
    after_second = len(logger.handlers)

    assert after_first == 1
    assert after_second == 1, "second configure_logging must not add another handler"


def test_configure_logging_applies_level() -> None:
    configure_logging("WARNING")
    assert logging.getLogger("app").level == logging.WARNING
    # Re-applying a different level on an already-configured logger still updates it.
    configure_logging("DEBUG")
    assert logging.getLogger("app").level == logging.DEBUG


def test_get_logger_namespaces_under_app() -> None:
    assert get_logger("http").name == "app.http"
    # Already-namespaced names pass through unchanged.
    assert get_logger("app").name == "app"
    assert get_logger("app.sub").name == "app.sub"


def test_request_id_filter_injects_contextvar_value() -> None:
    """The filter stamps the current request_id_var value onto a record."""
    filt = RequestIdFilter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )

    token = request_id_var.set("req-123")
    try:
        assert filt.filter(record) is True
        assert record.request_id == "req-123"  # type: ignore[attr-defined]
    finally:
        request_id_var.reset(token)


def test_request_id_filter_defaults_to_dash_outside_request() -> None:
    filt = RequestIdFilter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="x",
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert record.request_id == "-"  # type: ignore[attr-defined]


def test_structured_formatter_renders_request_id_and_extras() -> None:
    """The formatter includes the request id and serializes extra fields as JSON."""
    formatter = StructuredFormatter()
    record = logging.LogRecord(
        name="app.http",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-abc"  # type: ignore[attr-defined]
    record.method = "POST"  # type: ignore[attr-defined]
    record.status_code = 200  # type: ignore[attr-defined]

    line = formatter.format(record)
    assert "[req-abc]" in line
    assert "request" in line
    # Extras land in a JSON object appended to the line.
    assert '"method": "POST"' in line
    assert '"status_code": 200' in line


# --------------------------------------------------------------------------- #
# LLM metrics accumulator
# --------------------------------------------------------------------------- #


def test_snapshot_starts_zeroed() -> None:
    snap = snapshot()
    assert snap == {
        "calls": 0,
        "failures": 0,
        "total_latency_s": 0.0,
        "mean_latency_s": 0.0,
        "total_prompt_chars": 0,
        "total_completion_chars": 0,
    }


def test_record_and_snapshot_math() -> None:
    """Two calls (one ok, one failed) aggregate with the right mean latency."""
    record_llm_call(
        provider="local", latency_s=0.2, ok=True, prompt_chars=100, completion_chars=40
    )
    record_llm_call(
        provider="anthropic", latency_s=0.6, ok=False, prompt_chars=200, completion_chars=0
    )

    snap = snapshot()
    assert snap["calls"] == 2
    assert snap["failures"] == 1
    assert snap["total_latency_s"] == pytest.approx(0.8)
    assert snap["mean_latency_s"] == pytest.approx(0.4)  # 0.8 / 2
    assert snap["total_prompt_chars"] == 300
    assert snap["total_completion_chars"] == 40


def test_mean_latency_is_zero_when_no_calls() -> None:
    assert snapshot()["mean_latency_s"] == 0.0


def test_reset_metrics_zeroes_the_accumulator() -> None:
    record_llm_call(
        provider="local", latency_s=1.0, ok=True, prompt_chars=10, completion_chars=5
    )
    assert snapshot()["calls"] == 1
    reset_metrics()
    snap = snapshot()
    assert snap["calls"] == 0
    assert snap["failures"] == 0
    assert snap["total_latency_s"] == 0.0
    assert snap["total_completion_chars"] == 0
