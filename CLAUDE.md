# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> See also **AGENTS.md** (the canonical, tool-agnostic contributor guide). CLAUDE.md
> is the Claude-Code-specific layer; AGENTS.md holds the shared rules. When they
> overlap, AGENTS.md wins — keep this file thin.

## What this is

**ED Triage Trainer** — a deployable, web-based simulator for emergency-department
triage training. A trainee works one patient encounter end to end: takes a history
by chatting with an **LLM-driven patient**, measures vitals, assigns an **ESI level
(1–5)**, and orders critical interventions. The system scores them against expert
triage labels and real outcomes and gives immediate feedback. Cases are grounded in
de-identified MIMIC-IV-ED / MIETIC data plus a synthetic generator.

Standalone open-source app (not Amazon-internal). Full design:
`docs/superpowers/specs/2026-06-09-ed-triage-trainer-design.md`.

## Quick start

```bash
# Backend (Python 3.11+, FastAPI)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload          # serves on :8000

# Frontend (React/Vite)
cd frontend
npm install
npm run dev                            # Vite on :5173 (proxies /api to :8000)
```

The app runs with **zero credentials and zero network**: the default data source is
the open `mimic_demo` subset + synthetic cases, and the LLM provider falls back to a
scripted local stub when no API key is set. An offline demo always works.

## The one architectural idea: contract-first, language-split

Python owns **data + clinical logic**; TypeScript owns the **UI**. They meet *only*
at the JSON-Schema contract in `shared/schemas/`. Three schemas are the entire
cross-boundary surface:

| Schema | Meaning |
|--------|---------|
| `triage-case.schema.json` | A de-identified case: presentation, hidden history, expert labels, real outcome |
| `encounter.schema.json` | Live trainee-vs-case state — **the wire format** |
| `score-report.schema.json` | Automated performance scoring |

**Rule: never invent a field that isn't in a schema.** If a feature needs new data
across the boundary, edit the schema first, then update **all three** embodiments:
the JSON schema, the Pydantic model (`backend/app/models/`), and the TS type
(`frontend/src/api/contract.ts`). `backend/tests/test_contract.py` validates that
real backend objects (TriageCase, Encounter, ScoreReport — including a case built
by the MIMIC loader) conform to the schemas. Note its current limit: it guards the
**Python** side only; the TS `contract.ts` is hand-maintained to match and is not
yet auto-validated against the schemas. Keep all three in lockstep by hand until a
TS-side conformance check exists.

## The encounter is a state machine

```
CASE_LOAD → HISTORY → VITALS → ESI_ASSIGNMENT → INTERVENTIONS → FEEDBACK
```

Transitions are enforced **server-side only** in `backend/app/sim/`. The client
renders `encounter.stage` and posts actions; it can never skip ahead or see expert
labels before `FEEDBACK`. If you're tempted to add stage logic in the frontend,
stop — it belongs in `app/sim/`.

## Hard rules (clinical-safety + ethics critical)

- **Scoring numbers are deterministic and authoritative.** `app/scoring/` computes
  every number with rule-based code. The LLM writes *narrative only*, grounded in
  those numbers — it never produces or adjusts a score. Don't ask an LLM "what ESI
  is this?" for scoring.
- **Under-triage is the headline failure.** ESI scoring penalizes under-triage
  (assigning a less-acute level than expert) more than over-triage. This is the
  whole point of the tool; don't flatten it to plain accuracy.
- **Expert labels and full history stay server-side** until `stage == FEEDBACK`.
  Never serialize `case.expert` to the client early. The patient LLM persona is
  prompted with hidden history but instructed to reveal facts only when asked.
- **De-identification is enforced in code.** The loader rejects any case with
  `provenance.deidentified == false`. Age **bands** only, never exact ages/dates.
- **Credentialed data never enters git.** `mimic_full/` and `mietic/` payloads are
  `.gitignore`d. Only `mimic_demo` (open-access) and `synthetic` ship.
- **This is a training tool, not a medical device.** That disclaimer must stay
  visible in-product and in the README.

## Commands

```bash
# Backend quality bars (all must pass)
cd backend
ruff check . && mypy app && pytest                 # lint, types, tests
pytest tests/test_scoring.py -k under_triage        # a single test

# Frontend quality bars
cd frontend
npm run lint && npm run typecheck && npm run test    # eslint, tsc --noEmit, vitest
npx vitest run src/workflow/EsiStage.test.tsx        # a single test
npm run build                                        # production build
```

## Where things live

| Concern | Path |
|---------|------|
| Cross-language contract | `shared/schemas/*.json` |
| FastAPI entry / routes | `backend/app/main.py`, `backend/app/api/` |
| Pydantic models | `backend/app/models/` |
| LLM provider (pluggable) | `backend/app/llm/` (`provider.py` is the interface) |
| Source loaders → TriageCase | `backend/app/data/` |
| Encounter state machine | `backend/app/sim/` |
| Scoring engine | `backend/app/scoring/` |
| Persistence (SQLite) | `backend/app/store/` |
| Bundled open data | `backend/data/sources/mimic_demo/`, `.../synthetic/` |
| Typed API client | `frontend/src/api/` |
| Encounter store (Zustand) | `frontend/src/store/` |
| One component per stage | `frontend/src/workflow/` |
| Reusable UI | `frontend/src/components/` |

## Conventions

- **Backend:** Pydantic v2 models mirror the JSON schemas field-for-field. Routes
  are thin; logic lives in `sim/`, `scoring/`, `data/`, `llm/`. Type-hint
  everything (`mypy` is strict).
- **Frontend:** the Zustand encounter store is the single source of client truth;
  components subscribe via selectors. `src/workflow/<Stage>.tsx` maps 1:1 to a
  state-machine stage. Keep `three`-style heavy deps out — this is a form-driven UI.
- **LLM:** all calls go through `app/llm/provider.py`. Tests mock the provider; no
  network in CI. Prompts live next to the provider, not inline in routes.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`), scoped by
  area (`feat(scoring): …`, `feat(web): …`).

## What NOT to do

- Don't put state-machine or scoring logic in the frontend.
- Don't let an LLM produce a score, ESI level, or any number that's graded.
- Don't add a cross-boundary field without editing `shared/schemas/` first.
- Don't commit credentialed MIMIC/MIETIC data, exact ages, dates, or identifiers.
- Don't break the offline path (no API key, no network → app still runs).
