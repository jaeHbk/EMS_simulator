"""Deterministic, rule-based scoring for the ED Triage Trainer.

This package owns every *number* in a `ScoreReport`. The numbers are produced
exclusively by rule-based code here — the LLM never produces or alters a score,
an ESI level, or a grade. The LLM (in `app/llm/feedback.py`) authors only the
`narrative` string, grounded in these numbers; `score()` always leaves
`narrative == ""` for the API layer to fill later.

Public surface (see docs/MODULE_INTERFACES.md):

    from app.scoring import score
    report = score(enc, case)   # -> ScoreReport, narrative=""
"""

from app.scoring.engine import score

__all__ = ["score"]
