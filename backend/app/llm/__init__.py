"""LLM module: pluggable provider + the two prompt surfaces.

Public surface (per docs/MODULE_INTERFACES.md):
    provider.py : LLMProvider (Protocol), LocalProvider, AnthropicProvider,
                  OpenAIProvider, get_provider(settings) -> LLMProvider
    patient.py  : patient_reply(case, history, trainee_msg, provider) -> str
    feedback.py : feedback_narrative(report, case, provider) -> str

The default/offline provider is the deterministic, network-free LocalProvider, so
the app runs end to end with no API key and no cloud SDK installed. Prompts live in
prompts.py, beside the provider — never inline in routes.
"""

from app.llm.feedback import feedback_narrative
from app.llm.patient import patient_reply
from app.llm.provider import (
    AnthropicProvider,
    LLMProvider,
    LocalProvider,
    OpenAIProvider,
    get_provider,
)

__all__ = [
    "AnthropicProvider",
    "LLMProvider",
    "LocalProvider",
    "OpenAIProvider",
    "feedback_narrative",
    "get_provider",
    "patient_reply",
]
