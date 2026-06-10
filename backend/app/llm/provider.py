"""Pluggable LLM provider abstraction.

Every LLM call in the backend goes through an ``LLMProvider``. The default is
``LocalProvider`` — a deterministic, scripted, network-free stub that makes the
offline demo and the test suite work with no API key and no cloud SDK installed.

``AnthropicProvider`` and ``OpenAIProvider`` import their SDKs lazily (inside
``__init__``), so this module imports cleanly even when those optional extras are
not installed. Selecting a cloud provider without its SDK or API key raises a
clear, actionable error.

``get_provider(settings)`` dispatches on ``settings.llm_provider``.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable
from typing import Protocol, runtime_checkable

from app.config import Settings


class LLMUnavailableError(RuntimeError):
    """Raised when a cloud LLM call times out or fails after all retries.

    Higher layers (``patient_reply`` / ``feedback_narrative``) catch this and fall
    back to the deterministic ``LocalProvider`` so an encounter stays recoverable
    instead of surfacing as an unhandled 500.
    """


async def _with_resilience(
    coro_factory: Callable[[], Awaitable[str]],
    *,
    timeout: float,
    attempts: int = 2,
) -> str:
    """Run ``coro_factory()`` with a per-attempt timeout and a small retry budget.

    Each attempt is wrapped in :func:`asyncio.wait_for`; on timeout or any other
    exception we retry up to ``attempts`` times, then raise
    :class:`LLMUnavailableError` carrying the last error.
    """
    last: Exception | None = None
    for _ in range(attempts):
        try:
            return await asyncio.wait_for(coro_factory(), timeout=timeout)
        except TimeoutError as exc:
            # On Python 3.11+ asyncio.TimeoutError is an alias of the builtin.
            last = exc
        except Exception as exc:  # noqa: BLE001 - normalize every failure mode
            last = exc
    raise LLMUnavailableError(str(last) if last else "LLM call failed")


@runtime_checkable
class LLMProvider(Protocol):
    """The single seam every LLM call goes through.

    ``system`` is the system prompt; ``messages`` is a list of
    ``{"role": ..., "content": ...}`` dicts (roles: "user" / "assistant").
    Returns the model's text reply.
    """

    async def complete(self, system: str, messages: list[dict[str, str]]) -> str: ...


def _last_user_message(messages: list[dict[str, str]]) -> str:
    """Return the content of the most recent user-authored message (or "")."""
    for message in reversed(messages):
        if message.get("role") == "user":
            return message.get("content", "")
    return messages[-1].get("content", "") if messages else ""


class LocalProvider:
    """Deterministic, offline scripted provider — the default.

    It performs no network I/O. Replies are derived purely from the system prompt
    and the conversation, using simple keyword matching, so behavior is stable and
    testable.

    The system prompts authored in :mod:`app.llm.prompts` embed all the case /
    scoring facts the reply needs, and the higher-level ``patient_reply`` /
    ``feedback_narrative`` helpers do the substantive scripted composition. This
    provider supplies a sensible, deterministic fallback so it is useful even if
    called directly.
    """

    async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        question = _last_user_message(messages).strip()
        if not question:
            return "I'm here. What would you like to ask me?"

        lowered = question.lower()
        # Lightweight keyword routing so a direct call still yields a relevant,
        # deterministic line. The grounded scripted answers come from patient.py.
        if re.search(r"\bpain\b|hurt|ache|sore", lowered):
            return "Yes, I can tell you about the pain when you ask."
        if re.search(r"how long|when did|duration|since when|started", lowered):
            return "I can tell you about the timing when you ask."
        if re.search(r"medication|meds|taking|pills|drugs?", lowered):
            return "I can tell you about my medications when you ask."
        if re.search(r"allerg", lowered):
            return "I can tell you about my allergies when you ask."
        return "I'll do my best to answer what you ask me directly."


class AnthropicProvider:
    """Claude-backed provider. SDK imported lazily so the module loads without it."""

    def __init__(self, api_key: str, model: str, timeout: float = 20.0) -> None:
        if not api_key:
            raise RuntimeError(
                "AnthropicProvider selected but ANTHROPIC_API_KEY is empty. Set the "
                "key, or use LLM_PROVIDER=local for the offline scripted provider."
            )
        try:
            import anthropic  # noqa: PLC0415  (lazy import: optional cloud SDK)
        except ImportError as exc:  # pragma: no cover - exercised only with SDK absent
            raise RuntimeError(
                "AnthropicProvider selected but the 'anthropic' package is not "
                "installed. Install the extra (pip install -e \".[anthropic]\") or "
                "use LLM_PROVIDER=local."
            ) from exc
        self._model = model
        self._timeout = timeout
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def _call(self, system: str, messages: list[dict[str, str]]) -> str:
        response = await self._client.messages.create(
            model=self._model,
            system=system,
            messages=messages,
            max_tokens=1024,
        )
        parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
        return "".join(parts)

    async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        return await _with_resilience(
            lambda: self._call(system, messages), timeout=self._timeout
        )


class OpenAIProvider:
    """OpenAI-backed provider. SDK imported lazily so the module loads without it."""

    def __init__(self, api_key: str, model: str, timeout: float = 20.0) -> None:
        if not api_key:
            raise RuntimeError(
                "OpenAIProvider selected but OPENAI_API_KEY is empty. Set the key, "
                "or use LLM_PROVIDER=local for the offline scripted provider."
            )
        try:
            import openai  # noqa: PLC0415  (lazy import: optional cloud SDK)
        except ImportError as exc:  # pragma: no cover - exercised only with SDK absent
            raise RuntimeError(
                "OpenAIProvider selected but the 'openai' package is not installed. "
                "Install the extra (pip install -e \".[openai]\") or use "
                "LLM_PROVIDER=local."
            ) from exc
        self._model = model
        self._timeout = timeout
        self._client = openai.AsyncOpenAI(api_key=api_key)

    async def _call(self, system: str, messages: list[dict[str, str]]) -> str:
        chat_messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        chat_messages.extend(messages)
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=chat_messages,  # type: ignore[arg-type]
            max_tokens=1024,
        )
        return response.choices[0].message.content or ""

    async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
        return await _with_resilience(
            lambda: self._call(system, messages), timeout=self._timeout
        )


def get_provider(settings: Settings) -> LLMProvider:
    """Return the configured ``LLMProvider``, dispatching on ``settings.llm_provider``.

    Defaults to (and falls back to) the offline ``LocalProvider``. ``anthropic`` and
    ``openai`` construct lazily and raise a clear error if their key/SDK is missing.
    """
    provider_name = (settings.llm_provider or "local").strip().lower()
    if provider_name == "anthropic":
        return AnthropicProvider(
            settings.anthropic_api_key,
            settings.anthropic_model,
            timeout=settings.llm_timeout_seconds,
        )
    if provider_name == "openai":
        return OpenAIProvider(
            settings.openai_api_key,
            settings.openai_model,
            timeout=settings.llm_timeout_seconds,
        )
    # "local" and any unknown value fall back to the safe offline provider.
    return LocalProvider()
