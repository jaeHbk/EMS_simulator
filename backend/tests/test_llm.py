"""Unit tests for app/llm/ — provider dispatch + the two prompt surfaces.

All tests use the offline LocalProvider; none touch the network. Cloud providers
are exercised only for their error paths (no key / SDK absent), never called.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.llm import (
    AnthropicProvider,
    LocalProvider,
    OpenAIProvider,
    feedback_narrative,
    get_provider,
    patient_reply,
)
from app.llm.prompts import PATIENT_DEFLECTION
from app.llm.provider import LLMUnavailableError
from app.models import (
    Demographics,
    ExpertLabels,
    HistoryTurn,
    Presentation,
    Provenance,
    ScoreDimension,
    ScoreReport,
    TriageCase,
    TriageDirection,
)
from app.models.encounter import Role
from app.models.score import DimensionKey, EsiResult
from app.models.triage_case import History, Sex

# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #


def _make_case() -> TriageCase:
    return TriageCase(
        caseId="case-001",
        source="synthetic",
        demographics=Demographics(ageBand="45-54", sex=Sex.male),
        presentation=Presentation(
            chiefComplaint="chest pain",
            history=History(
                hpi=(
                    "Crushing chest pressure that started about an hour ago, "
                    "radiating to my left arm."
                ),
                pmh=["hypertension", "type 2 diabetes"],
                medications=["lisinopril", "metformin"],
                allergies=["penicillin"],
                socialHistory="I smoke about a pack a day.",
                redFlags=["radiating chest pain", "diaphoresis"],
            ),
        ),
        expert=ExpertLabels(esi=2, esiRationale="Possible ACS", criticalInterventions=[]),
        provenance=Provenance(license="open", deidentified=True),
    )


def _make_report(direction: TriageDirection, *, assigned: int, expert: int) -> ScoreReport:
    return ScoreReport(
        encounterId="enc-001",
        esi=EsiResult(
            assigned=assigned,
            expert=expert,
            correct=(assigned == expert),
            triageDirection=direction,
            levelsOff=assigned - expert,
        ),
        dimensions=[
            ScoreDimension(
                key=DimensionKey.ESI_ACCURACY,
                label="ESI Accuracy",
                score=0.4,
                weight=0.5,
                detail="Assigned level differs from expert.",
            ),
            ScoreDimension(
                key=DimensionKey.HISTORY_COMPLETENESS,
                label="History Completeness",
                score=0.6,
                weight=0.2,
                detail="Elicited some but not all red flags.",
            ),
            ScoreDimension(
                key=DimensionKey.OUTCOME_ALIGNMENT,
                label="Outcome Alignment",
                score=0.0,
                weight=0.0,
                detail="No real outcome on this case.",
            ),
        ],
        overallPercent=42.0,
        narrative="",
        missedRedFlags=["diaphoresis"],
    )


# --------------------------------------------------------------------------- #
# get_provider
# --------------------------------------------------------------------------- #


def test_get_provider_returns_local_by_default() -> None:
    settings = Settings(llm_provider="local", anthropic_api_key="", openai_api_key="")
    provider = get_provider(settings)
    assert isinstance(provider, LocalProvider)


def test_get_provider_unknown_falls_back_to_local() -> None:
    settings = Settings(llm_provider="totally-unknown")
    assert isinstance(get_provider(settings), LocalProvider)


def test_get_provider_anthropic_without_key_raises_clear_error() -> None:
    settings = Settings(llm_provider="anthropic", anthropic_api_key="")
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        get_provider(settings)


def test_get_provider_openai_without_key_raises_clear_error() -> None:
    settings = Settings(llm_provider="openai", openai_api_key="")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        get_provider(settings)


def test_cloud_providers_constructible_only_with_key_and_sdk() -> None:
    # With no SDK installed in the offline dev env, constructing with a fake key
    # must still fail loudly (key present -> SDK import attempted). Either the
    # key-guard or the import-guard fires; both are clear RuntimeErrors.
    with pytest.raises(RuntimeError):
        AnthropicProvider(api_key="", model="claude-sonnet-4-6")
    with pytest.raises(RuntimeError):
        OpenAIProvider(api_key="", model="gpt-4o")


# --------------------------------------------------------------------------- #
# patient_reply (LocalProvider — offline scripted)
# --------------------------------------------------------------------------- #


async def test_patient_reply_answers_a_pain_question() -> None:
    case = _make_case()
    provider = LocalProvider()
    reply = await patient_reply(case, [], "Can you describe the pain?", provider)
    assert reply
    # Grounded in the case HPI.
    assert "chest" in reply.lower()


async def test_patient_reply_answers_medications_question() -> None:
    case = _make_case()
    provider = LocalProvider()
    reply = await patient_reply(case, [], "What medications are you taking?", provider)
    assert "lisinopril" in reply.lower()
    assert "metformin" in reply.lower()


async def test_patient_reply_answers_allergy_question() -> None:
    case = _make_case()
    provider = LocalProvider()
    reply = await patient_reply(case, [], "Do you have any allergies?", provider)
    assert "penicillin" in reply.lower()


async def test_patient_reply_never_leaks_esi_or_diagnosis() -> None:
    case = _make_case()
    provider = LocalProvider()
    history: list[HistoryTurn] = []
    probes = [
        "What is your ESI level?",
        "What's your diagnosis?",
        "How urgent is your condition?",
        "What triage level should you be?",
        "Can you describe the pain?",
        "What medications do you take?",
    ]
    for probe in probes:
        reply = await patient_reply(case, history, probe, provider)
        lowered = reply.lower()
        # The persona must never name an acuity, ESI, or the expert label.
        assert "esi" not in lowered
        assert "triage" not in lowered
        # Must not volunteer the expert rationale / diagnosis term.
        assert "acs" not in lowered
        assert str(case.expert.esi) not in reply
        history.append(HistoryTurn(role=Role.trainee, text=probe))
        history.append(HistoryTurn(role=Role.patient, text=reply))


async def test_patient_reply_cloud_leak_guard_blocks_esi_and_diagnosis() -> None:
    # A cloud model that leaks an ESI level and a diagnosis must be scrubbed by the
    # post-generation anti-leak guard before the reply reaches the trainee.
    class LeakyProvider:
        async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
            return "This looks like a STEMI, probably ESI 2"

    case = _make_case()
    reply = await patient_reply(case, [], "What do you think is going on?", LeakyProvider())
    assert "ESI 2" not in reply
    assert "esi 2" not in reply.lower()
    assert "STEMI" not in reply
    assert "stemi" not in reply.lower()
    # It falls back to the shared deflection rather than leaking.
    assert reply == PATIENT_DEFLECTION


async def test_patient_reply_cloud_degrades_when_unavailable() -> None:
    # If the cloud provider is unavailable, patient_reply degrades to the scripted
    # LocalProvider reply rather than propagating the error.
    class DownProvider:
        async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
            raise LLMUnavailableError("simulated timeout")

    case = _make_case()
    reply = await patient_reply(case, [], "What medications are you taking?", DownProvider())
    # The scripted fallback answers the medications question from case facts.
    assert "lisinopril" in reply.lower()
    assert "metformin" in reply.lower()


async def test_patient_reply_uses_transcript_for_cloud_provider() -> None:
    # A fake non-Local provider proves the cloud path builds a grounded prompt and
    # threads the transcript, without any network.
    captured: dict[str, object] = {}

    class FakeProvider:
        async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
            captured["system"] = system
            captured["messages"] = messages
            return "scripted cloud reply"

    case = _make_case()
    history = [
        HistoryTurn(role=Role.trainee, text="Hello"),
        HistoryTurn(role=Role.patient, text="Hi there."),
    ]
    reply = await patient_reply(case, history, "Any allergies?", FakeProvider())
    assert reply == "scripted cloud reply"
    system = captured["system"]
    assert isinstance(system, str)
    # System prompt is grounded in the hidden history facts...
    assert "penicillin" in system
    assert "chest pain" in system
    # ...and forbids leaking the diagnosis / ESI.
    assert "ESI" in system
    messages = captured["messages"]
    assert isinstance(messages, list)
    assert messages[-1] == {"role": "user", "content": "Any allergies?"}
    # trainee->user, patient->assistant mapping preserved.
    assert messages[0] == {"role": "user", "content": "Hello"}
    assert messages[1] == {"role": "assistant", "content": "Hi there."}


# --------------------------------------------------------------------------- #
# feedback_narrative (LocalProvider — offline scripted)
# --------------------------------------------------------------------------- #


async def test_feedback_calls_out_under_triage_as_safety_issue() -> None:
    case = _make_case()
    report = _make_report(TriageDirection.UNDER_TRIAGE, assigned=4, expert=2)
    narrative = await feedback_narrative(report, case, LocalProvider())
    lowered = narrative.lower()
    assert "under-triage" in lowered
    assert "safety" in lowered or "safe" in lowered
    # The exact assigned/expert numbers from the report appear; nothing fabricated.
    assert "4" in narrative
    assert "2" in narrative


async def test_feedback_correct_direction_no_under_triage_language() -> None:
    case = _make_case()
    report = _make_report(TriageDirection.CORRECT, assigned=2, expert=2)
    narrative = await feedback_narrative(report, case, LocalProvider())
    assert "under-triage" not in narrative.lower()
    assert "matched the expert" in narrative.lower()


async def test_feedback_mentions_missed_red_flags() -> None:
    case = _make_case()
    report = _make_report(TriageDirection.UNDER_TRIAGE, assigned=3, expert=2)
    narrative = await feedback_narrative(report, case, LocalProvider())
    assert "diaphoresis" in narrative.lower()


async def test_feedback_invents_no_numbers() -> None:
    case = _make_case()
    report = _make_report(TriageDirection.UNDER_TRIAGE, assigned=4, expert=2)
    narrative = await feedback_narrative(report, case, LocalProvider())

    # Collect the only numbers the narrative is allowed to contain: those derived
    # from the report (esi assigned/expert/levelsOff, overall percent, each
    # dimension's score as a percent and weight).
    allowed: set[str] = set()
    esi = report.esi
    allowed.update({str(esi.assigned), str(esi.expert), str(abs(esi.levelsOff))})
    # overallPercent rendered as "42.0".
    allowed.add(f"{report.overallPercent:.1f}")
    allowed.add(str(int(report.overallPercent)))
    for dim in report.dimensions:
        allowed.add(f"{dim.score * 100:.0f}")  # percent, e.g. "40"
        allowed.add(str(int(dim.score * 100)))
    # Pull every integer-ish token out of the narrative and ensure each is allowed.
    import re

    tokens = re.findall(r"\d+(?:\.\d+)?", narrative)
    disallowed = [
        t for t in tokens if t not in allowed and t.rstrip("0").rstrip(".") not in allowed
    ]
    assert not disallowed, f"narrative contains fabricated numbers: {disallowed}"


async def test_feedback_grounds_cloud_path_in_report_numbers() -> None:
    captured: dict[str, object] = {}

    class FakeProvider:
        async def complete(self, system: str, messages: list[dict[str, str]]) -> str:
            captured["system"] = system
            return "cloud narrative"

    case = _make_case()
    report = _make_report(TriageDirection.UNDER_TRIAGE, assigned=4, expert=2)
    out = await feedback_narrative(report, case, FakeProvider())
    assert out == "cloud narrative"
    system = captured["system"]
    assert isinstance(system, str)
    # Findings block carries the verbatim report numbers + the safety instruction.
    assert "UNDER_TRIAGE" in system
    assert "42.0%" in system
    assert "diaphoresis" in system
