"""Feedback-narrative prompt surface — NARRATIVE ONLY, never numbers.

``feedback_narrative`` turns a deterministic ``ScoreReport`` into encouraging,
specific teaching prose for the trainee. It is grounded ONLY in the numbers the
scoring engine already computed (ESI result, dimensions, missed red flags). It
must NOT invent or change any number or ESI level.

If ``report.esi.triageDirection == UNDER_TRIAGE`` the narrative explicitly calls
out under-triage as a patient-safety issue — the headline failure this tool
exists to reduce.

The offline ``LocalProvider`` path returns a deterministic template-filled
narrative composed straight from the report fields (no fabricated values). Cloud
providers receive a findings block built from the same numbers and a strict
system prompt.
"""

from __future__ import annotations

from app.llm.prompts import build_feedback_system
from app.llm.provider import LLMProvider, LocalProvider
from app.models import ScoreReport, TriageCase, TriageDirection


def _format_findings(report: ScoreReport) -> str:
    """Build the verbatim findings block handed to the LLM (cloud path).

    Every value here comes straight from the deterministic ``ScoreReport`` so the
    model has no room — and no excuse — to invent numbers.
    """
    esi = report.esi
    lines: list[str] = [
        f"Overall score: {report.overallPercent:.1f}%",
        (
            f"ESI: you assigned {esi.assigned}, the expert reference was {esi.expert} "
            f"(correct={esi.correct}, direction={esi.triageDirection.value}, "
            f"levelsOff={esi.levelsOff})."
        ),
        "Competency dimensions:",
    ]
    for dimension in report.dimensions:
        lines.append(
            f"  - {dimension.label} ({dimension.key.value}): "
            f"score {dimension.score:.2f}, weight {dimension.weight:.2f}. "
            f"{dimension.detail}"
        )
    if report.missedRedFlags:
        lines.append("Missed red flags: " + ", ".join(report.missedRedFlags) + ".")
    else:
        lines.append("Missed red flags: none.")
    return "\n".join(lines)


def _scripted_narrative(report: ScoreReport) -> str:
    """Deterministic template-filled teaching narrative for the offline path.

    Uses only values present in ``report`` — never fabricates a number or level.
    """
    esi = report.esi
    paragraphs: list[str] = []

    paragraphs.append(
        f"Nice work completing this encounter. Your overall score was "
        f"{report.overallPercent:.1f}%."
    )

    # ESI result — under-triage is called out as a safety issue.
    if esi.triageDirection == TriageDirection.UNDER_TRIAGE:
        paragraphs.append(
            f"Safety alert: you assigned ESI {esi.assigned}, but the expert reference "
            f"was ESI {esi.expert} — that is {esi.levelsOff} level(s) LESS acute than "
            f"warranted. This is under-triage, the most dangerous error in triage: a "
            f"sicker patient gets under-prioritized and can deteriorate while waiting. "
            f"Before finalizing, ask yourself what the worst plausible cause of this "
            f"presentation is and triage to that."
        )
    elif esi.triageDirection == TriageDirection.OVER_TRIAGE:
        paragraphs.append(
            f"You assigned ESI {esi.assigned} versus the expert's ESI {esi.expert} "
            f"({abs(esi.levelsOff)} level(s) MORE acute than needed). This is "
            f"over-triage — safer than under-triage, but worth calibrating so urgent "
            f"resources stay available for those who need them most."
        )
    else:
        paragraphs.append(
            f"Your ESI assignment of {esi.assigned} matched the expert reference "
            f"exactly. Well done — that is the level this patient needed."
        )

    # Per-dimension coaching, grounded in each dimension's own detail string.
    for dimension in report.dimensions:
        if dimension.weight == 0:
            continue
        percent = dimension.score * 100
        if dimension.score >= 0.8:
            lead = "Strong"
        elif dimension.score >= 0.5:
            lead = "Developing"
        else:
            lead = "Needs work"
        paragraphs.append(
            f"{lead} — {dimension.label}: {percent:.0f}%. {dimension.detail}"
        )

    # Missed red flags, named explicitly.
    if report.missedRedFlags:
        paragraphs.append(
            "Red flags you did not elicit or act on: "
            + ", ".join(report.missedRedFlags)
            + ". Surfacing these in the history is what separates a safe triage from a "
            "risky one — practice screening questions that draw them out."
        )

    paragraphs.append(
        "Keep practicing. This is a training tool, not a medical device, so use it to "
        "build your instincts before the clinical floor."
    )
    return "\n\n".join(paragraphs)


async def feedback_narrative(
    report: ScoreReport,
    case: TriageCase,
    provider: LLMProvider,
) -> str:
    """Return encouraging, grounded teaching feedback for the trainee.

    Offline (``LocalProvider``): a deterministic template-filled narrative built
    from the report fields. Cloud providers: a strict system prompt + findings
    block via ``provider.complete``. In every path the narrative is grounded only
    in the report's numbers and never invents or changes one.
    """
    if isinstance(provider, LocalProvider):
        return _scripted_narrative(report)

    findings = _format_findings(report)
    system = build_feedback_system(findings=findings)
    user_msg = (
        "Write the teaching feedback for this trainee, grounded strictly in the "
        "findings above. Do not introduce any number or ESI level that is not listed."
    )
    return await provider.complete(system, [{"role": "user", "content": user_msg}])
