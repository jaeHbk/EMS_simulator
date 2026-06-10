"""Tests that exercise the REAL cloud SDK-parsing code in app/llm/provider.py.

The cloud providers (`AnthropicProvider` / `OpenAIProvider`) import their SDKs
lazily inside `__init__`. These tests monkeypatch ``sys.modules["anthropic"]`` /
``sys.modules["openai"]`` with fake modules whose async clients return objects
shaped exactly like the real SDK responses (Anthropic: ``.content[0].text``;
OpenAI: ``.choices[0].message.content``). That lets us prove the response-parsing
and resilience code paths work without installing an SDK or hitting the network.

The repo runs ``asyncio_mode = auto`` (see pyproject), so async tests need no
explicit marker — matching the style in test_llm.py.
"""

from __future__ import annotations

import asyncio
import sys
import types
from typing import Any

import pytest

from app.llm.provider import AnthropicProvider, LLMUnavailableError, OpenAIProvider

# --------------------------------------------------------------------------- #
# Fake Anthropic SDK
# --------------------------------------------------------------------------- #


class _AnthropicTextBlock:
    """Mimics an SDK content block: has ``.type == "text"`` and ``.text``."""

    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class _AnthropicResponse:
    def __init__(self, text: str) -> None:
        self.content = [_AnthropicTextBlock(text)]


class _FakeAnthropicMessages:
    def __init__(self, *, reply: str, delay: float) -> None:
        self._reply = reply
        self._delay = delay

    async def create(self, **kwargs: Any) -> _AnthropicResponse:
        if self._delay:
            await asyncio.sleep(self._delay)
        return _AnthropicResponse(self._reply)


class _FakeAsyncAnthropic:
    # Class-level knobs so the constructor signature stays SDK-faithful (api_key=...).
    _reply = "parsed anthropic text"
    _delay = 0.0

    def __init__(self, *, api_key: str) -> None:
        self.api_key = api_key
        self.messages = _FakeAnthropicMessages(reply=self._reply, delay=self._delay)


def _install_fake_anthropic(monkeypatch: pytest.MonkeyPatch, *, reply: str, delay: float) -> None:
    module = types.ModuleType("anthropic")

    class _Client(_FakeAsyncAnthropic):
        _reply = reply
        _delay = delay

    module.AsyncAnthropic = _Client  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "anthropic", module)


# --------------------------------------------------------------------------- #
# Fake OpenAI SDK
# --------------------------------------------------------------------------- #


class _OpenAIMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _OpenAIChoice:
    def __init__(self, content: str) -> None:
        self.message = _OpenAIMessage(content)


class _OpenAIResponse:
    def __init__(self, content: str) -> None:
        self.choices = [_OpenAIChoice(content)]


class _FakeOpenAICompletions:
    def __init__(self, *, reply: str, delay: float) -> None:
        self._reply = reply
        self._delay = delay

    async def create(self, **kwargs: Any) -> _OpenAIResponse:
        if self._delay:
            await asyncio.sleep(self._delay)
        return _OpenAIResponse(self._reply)


class _FakeOpenAIChat:
    def __init__(self, *, reply: str, delay: float) -> None:
        self.completions = _FakeOpenAICompletions(reply=reply, delay=delay)


class _FakeAsyncOpenAI:
    _reply = "parsed openai text"
    _delay = 0.0

    def __init__(self, *, api_key: str) -> None:
        self.api_key = api_key
        self.chat = _FakeOpenAIChat(reply=self._reply, delay=self._delay)


def _install_fake_openai(monkeypatch: pytest.MonkeyPatch, *, reply: str, delay: float) -> None:
    module = types.ModuleType("openai")

    class _Client(_FakeAsyncOpenAI):
        _reply = reply
        _delay = delay

    module.AsyncOpenAI = _Client  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "openai", module)


# --------------------------------------------------------------------------- #
# Anthropic: response parsing + timeout
# --------------------------------------------------------------------------- #


async def test_anthropic_complete_parses_sdk_response(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_anthropic(monkeypatch, reply="hello from claude", delay=0.0)
    provider = AnthropicProvider(api_key="sk-test", model="claude-sonnet-4-6")
    out = await provider.complete("sys", [{"role": "user", "content": "hi"}])
    assert out == "hello from claude"


async def test_anthropic_complete_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    # Client sleeps far longer than the tiny timeout -> LLMUnavailableError.
    _install_fake_anthropic(monkeypatch, reply="too slow", delay=1.0)
    provider = AnthropicProvider(api_key="sk-test", model="claude-sonnet-4-6", timeout=0.01)
    with pytest.raises(LLMUnavailableError):
        await provider.complete("sys", [{"role": "user", "content": "hi"}])


# --------------------------------------------------------------------------- #
# OpenAI: response parsing + timeout
# --------------------------------------------------------------------------- #


async def test_openai_complete_parses_sdk_response(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_openai(monkeypatch, reply="hello from gpt", delay=0.0)
    provider = OpenAIProvider(api_key="sk-test", model="gpt-4o")
    out = await provider.complete("sys", [{"role": "user", "content": "hi"}])
    assert out == "hello from gpt"


async def test_openai_complete_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_openai(monkeypatch, reply="too slow", delay=1.0)
    provider = OpenAIProvider(api_key="sk-test", model="gpt-4o", timeout=0.01)
    with pytest.raises(LLMUnavailableError):
        await provider.complete("sys", [{"role": "user", "content": "hi"}])
