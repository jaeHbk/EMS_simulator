"""Patient-persona prompt surface.

``patient_reply`` produces the LLM patient's next utterance during the HISTORY
stage. The persona is grounded STRICTLY in the case's hidden history
(``case.presentation.history`` + ``chiefComplaint``):

- answers in first person,
- reveals a fact only when the trainee asks about it,
- never volunteers the diagnosis or ESI level,
- never invents facts outside the case.

For the offline ``LocalProvider``, this module composes a deterministic, scripted
answer keyed off the trainee's question (keyword match on pain, duration,
medications, allergies, history, social) so the offline demo and tests work
without a real LLM. For cloud providers, it builds the grounded system prompt and
delegates to ``provider.complete``.
"""

from __future__ import annotations

import re

from app.llm.prompts import build_patient_system
from app.llm.provider import LLMProvider, LocalProvider
from app.models import HistoryTurn, TriageCase
from app.models.encounter import Role

# Phrases that, in the offline path, would force the persona to leak the answer.
# We keep a fixed deflection so the scripted patient never names a diagnosis/ESI.
_DIAGNOSIS_QUERY = re.compile(
    r"\b(diagnos\w*|what'?s wrong with|what do you have|esi|triage|how (urgent|sick|serious)|"
    r"what level|acuity)\b",
    re.IGNORECASE,
)


def _join(values: list[str], *, empty: str) -> str:
    cleaned = [v.strip() for v in values if v and v.strip()]
    return ", ".join(cleaned) if cleaned else empty


def _build_system(case: TriageCase) -> str:
    """Render the patient-persona system prompt from the case's hidden history."""
    history = case.presentation.history
    return build_patient_system(
        chief_complaint=case.presentation.chiefComplaint or "not specified",
        hpi=(history.hpi or "").strip() or "nothing else to add",
        pmh=_join(history.pmh, empty="no significant past medical history"),
        medications=_join(history.medications, empty="no regular medications"),
        allergies=_join(history.allergies, empty="no known allergies"),
        social_history=(history.socialHistory or "").strip() or "nothing notable",
        red_flags=_join(history.redFlags, empty="none beyond what is described"),
    )


def _to_messages(history: list[HistoryTurn], trainee_msg: str) -> list[dict[str, str]]:
    """Map the transcript + new trainee message to provider chat messages."""
    messages: list[dict[str, str]] = []
    for turn in history:
        role = "user" if turn.role == Role.trainee else "assistant"
        messages.append({"role": role, "content": turn.text})
    messages.append({"role": "user", "content": trainee_msg})
    return messages


def _scripted_reply(case: TriageCase, trainee_msg: str) -> str:
    """Deterministic, grounded patient answer for the offline LocalProvider path.

    Keyword-routes the trainee's question to the relevant case fact and answers in
    the first person. Never reveals diagnosis or ESI, never invents facts.
    """
    history = case.presentation.history
    text = trainee_msg.strip()
    lowered = text.lower()

    # Never leak the diagnosis / acuity, even if asked directly.
    if _DIAGNOSIS_QUERY.search(lowered):
        return (
            "I really don't know what's causing it or how serious it is — that's "
            "what I'm hoping you can tell me. I can describe how I'm feeling."
        )

    # Pain / symptom character.
    if re.search(r"\bpain\b|hurt|ache|sore|symptom|feel|feeling|bother", lowered):
        if history.hpi and history.hpi.strip():
            return f"Here's what's going on: {history.hpi.strip()}"
        return f"It's mainly the {case.presentation.chiefComplaint.lower()} that brought me in."

    # Onset / duration / timing.
    if re.search(r"how long|when did|duration|since when|started|onset|begin", lowered):
        if history.hpi and history.hpi.strip():
            return f"As for the timing — {history.hpi.strip()}"
        return "I can't give you an exact time, but it's been bothering me enough to come in."

    # Medications.
    if re.search(r"medication|meds|taking|pills|prescri|drugs?\b", lowered):
        meds = _join(history.medications, empty="")
        if meds:
            return f"I take {meds}."
        return "I'm not taking any regular medications."

    # Allergies.
    if re.search(r"allerg", lowered):
        allergies = _join(history.allergies, empty="")
        if allergies:
            return f"Yes — I'm allergic to {allergies}."
        return "No, I don't have any known allergies."

    # Past medical history.
    if re.search(r"medical history|past (medical|health)|condition|chronic|diagnosed before|"
                 r"history of|ever had", lowered):
        pmh = _join(history.pmh, empty="")
        if pmh:
            return f"In the past I've had {pmh}."
        return "No, I don't have any significant medical history."

    # Social history.
    if re.search(r"smoke|smoking|alcohol|drink|drugs? use|social|work|live|occupation|tobacco",
                 lowered):
        social = (history.socialHistory or "").strip()
        if social:
            return f"About that — {social}"
        return "There's nothing unusual about my lifestyle or living situation."

    # Greeting / open-ended opener.
    if re.search(r"^(hi|hello|hey|good (morning|afternoon|evening))\b|what brings|why are you|"
                 r"what'?s going on|how can|what happened", lowered):
        return f"Hi. I came in because of {case.presentation.chiefComplaint.lower()}."

    # Default: re-anchor on the chief complaint without volunteering more.
    return (
        f"I'm here because of {case.presentation.chiefComplaint.lower()}. "
        "Ask me anything specific and I'll tell you what I can."
    )


async def patient_reply(
    case: TriageCase,
    history: list[HistoryTurn],
    trainee_msg: str,
    provider: LLMProvider,
) -> str:
    """Return the patient persona's reply to ``trainee_msg``.

    Offline (``LocalProvider``): a deterministic, fact-grounded scripted answer.
    Cloud providers: a grounded system prompt + the transcript via
    ``provider.complete``.
    """
    if isinstance(provider, LocalProvider):
        return _scripted_reply(case, trainee_msg)

    system = _build_system(case)
    messages = _to_messages(history, trainee_msg)
    return await provider.complete(system, messages)
