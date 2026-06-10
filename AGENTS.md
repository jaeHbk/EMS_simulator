# AGENTS.md

Canonical, tool-agnostic guide for any AI agent or human contributor working in
this repository. (Claude Code reads `CLAUDE.md`, which defers to this file for
shared rules.) Read this fully before editing.

## Project

**ED Triage Trainer** — a web-based emergency-department triage training simulator.
A trainee takes a history from an **LLM-driven patient**, measures vitals, assigns
an **ESI level (1–5)**, and orders critical interventions; the system scores them
against expert labels and real outcomes and gives immediate feedback. Grounded in
de-identified MIMIC-IV-ED / MIETIC data plus a synthetic generator. Standalone
open-source app.

Authoritative design: `docs/superpowers/specs/2026-06-09-ed-triage-trainer-design.md`.

## Repository layout

```
shared/schemas/   JSON-Schema contract — the ONLY cross-language surface
backend/          Python 3.11+ · FastAPI · Pydantic v2 · SQLite  (data + clinical logic)
frontend/         React 18 · Vite · TypeScript · Zustand          (UI)
docs/             Design specs and source/ethics docs
```

## The contract is sacred

`shared/schemas/` (`triage-case`, `encounter`, `score-report`, JSON Schema draft-07)
defines every value that crosses the Python↔TypeScript boundary. Workflow:

1. Need a new cross-boundary field? **Edit the schema first.**
2. Update the Pydantic model (`backend/app/models/`) and the TS type
   (`frontend/src/api/`) to match.
3. Both sides are auto-validated against the schemas and must stay green:
   `backend/tests/test_contract.py` validates real **Python** objects (TriageCase
   incl. the MIMIC-loader path, Encounter, ScoreReport), and
   `frontend/src/api/contract-schema.test.ts` validates `contract.ts`-typed fixtures
   with ajv. A field renamed/typed wrong in either language fails its conformance test.

Nullability rule of thumb: a field any producer can leave unset is declared nullable
in **all three** places (`["T","null"]` in the schema, `T | None` in Pydantic,
`T | null` in TS). Never serialize a field that isn't in a schema. Never let the
embodiments drift.

## The encounter state machine

```
CASE_LOAD → HISTORY → VITALS → ESI_ASSIGNMENT → INTERVENTIONS → FEEDBACK
```

Enforced **server-side only**, in `backend/app/sim/`. The client renders the current
stage and posts actions — it cannot skip ahead, and it cannot see `case.expert`
labels until `stage == FEEDBACK`.

## Non-negotiable rules

1. **Deterministic scoring.** `backend/app/scoring/` computes all graded numbers
   with rule-based code. The LLM authors narrative feedback grounded in those
   numbers; it never produces or changes a score, ESI level, or grade.
2. **Under-triage > over-triage in penalty.** Under-triage (assigning a *less*
   acute level than the expert) is the safety failure this tool targets; scoring
   weights it more heavily. Do not reduce ESI scoring to symmetric accuracy.
3. **Server-side secrets.** Expert labels and full hidden history never reach the
   client before `FEEDBACK`.
4. **De-identification enforced in code.** Loaders reject `provenance.deidentified
   == false`. Age **bands** only — never exact ages, dates, or identifiers.
5. **No credentialed data in git.** Only `mimic_demo` (open-access) and `synthetic`
   are committed. `mimic_full/` and `mietic/` payloads are `.gitignore`d.
6. **Offline-first.** With no LLM API key and no network, the app still runs end to
   end (scripted local patient stub + bundled cases). CI never hits the network.
7. **Training tool, not a medical device.** Keep that disclaimer in-product.

## Build & test

| | Backend (`cd backend`) | Frontend (`cd frontend`) |
|---|---|---|
| Install | `pip install -e ".[dev]"` | `npm install` |
| Run | `uvicorn app.main:app --reload` (:8000) | `npm run dev` (:5173) |
| Lint | `ruff check .` | `npm run lint` |
| Types | `mypy app` | `npm run typecheck` |
| Test | `pytest` | `npm run test` |
| Build | — | `npm run build` |

A change is "done" only when its side's lint + types + tests all pass, and
`test_contract.py` is green if the contract was touched.

## Conventions

- **Python:** Pydantic v2 models mirror schemas field-for-field; full type hints
  (strict `mypy`); thin routes, logic in `sim/`/`scoring/`/`data/`/`llm/`.
- **TypeScript:** strict mode, `noUncheckedIndexedAccess`; Zustand store is the
  single client source of truth; one `src/workflow/<Stage>.tsx` per machine stage.
- **LLM:** every call goes through `backend/app/llm/provider.py`; prompts live
  beside it; tests mock it.
- **Commits:** Conventional Commits, area-scoped (`feat(scoring):`, `feat(web):`,
  `fix(data):`, `docs:`, `test:`). One logical change per commit.

## For parallel agents

This repo is structured so independent agents can build modules concurrently
without colliding:

- The **contract** (`shared/schemas/`) and these docs are the fixed point everyone
  codes against. Treat them as read-mostly; coordinate before changing a schema.
- Backend modules (`data/`, `llm/`, `sim/`, `scoring/`, `store/`) and the frontend
  are designed to be separately ownable. Stay inside your assigned module; depend
  on other modules only through their public interface + the schemas.
- Don't edit another module's internals to make yours work — if you need a change
  there, note it for that module's owner.
- When you finish, run your side's quality bars before declaring done; report what
  you ran and the result. Evidence before assertions.
