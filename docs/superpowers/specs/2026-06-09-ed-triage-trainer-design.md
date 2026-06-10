# ED Triage Trainer — Design

**Date:** 2026-06-09
**Status:** Approved (initial scaffold)

## Problem

Medical students, nursing staff, and other ED trainees under-triage patients at
more than twice the acceptable rate. Existing training tools use scripted,
non-interactive scenarios and cannot close the gap. Trainees need realistic,
conversational practice with real patient presentations before the clinical floor.

## Approach

An LLM-driven, web-based triage training simulator. The trainee works a real
ED-style encounter end to end: take a history by talking to an LLM patient,
measure vitals, assign an **ESI level (1–5)**, and order critical interventions.
The system scores the trainee's decisions against expert triage labels and real
patient outcomes, then delivers immediate, specific feedback.

Cases are grounded in de-identified **MIMIC-IV-ED** data and **MIETIC** case data
via PhysioNet, supplemented by a synthetic case generator. Every source is
normalized to one internal `TriageCase` schema.

## The encounter as a state machine

The trainee's clinical workflow is a strict, server-enforced state machine. The
client renders the current stage and posts actions; it cannot skip ahead.

```
CASE_LOAD → HISTORY → VITALS → ESI_ASSIGNMENT → INTERVENTIONS → FEEDBACK
```

| Stage | Trainee action | System behavior |
|-------|----------------|-----------------|
| `CASE_LOAD` | Reads chief complaint | Loads a `TriageCase`; expert labels stay server-side |
| `HISTORY` | Free-text chat with the patient | LLM persona answers only from the case's hidden history facts |
| `VITALS` | Chooses which vitals to measure | Server reveals ground-truth values for measured vitals only |
| `ESI_ASSIGNMENT` | Picks ESI 1–5 | Recorded; no feedback yet |
| `INTERVENTIONS` | Orders critical interventions | Recorded |
| `FEEDBACK` | Reviews score | Scoring engine + LLM narrative; expert labels now revealed |

## Architecture

**Language split = agent split.** Python owns data + clinical logic; TypeScript
owns the UI. They meet only at the JSON-Schema contract.

```
shared/schemas/        Source of truth for the contract (JSON Schema, draft-07)
  triage-case.schema.json    A de-identified case + expert labels + outcome
  encounter.schema.json      Live trainee-vs-case state (the wire format)
  score-report.schema.json   Automated performance scoring

backend/   FastAPI + Pydantic + SQLite
  app/api/        REST routes (encounters, chat, vitals, esi, interventions)
  app/models/     Pydantic models generated-against / validated-against schemas
  app/llm/        Pluggable provider (anthropic default; openai, local stubs)
  app/data/       Source loaders → TriageCase; provenance + de-id enforcement
  app/sim/        Encounter state machine (transition rules live here only)
  app/scoring/    Deterministic ESI + competency scoring (authoritative numbers)
  app/store/      SQLite persistence for encounters + analytics
  data/sources/   mimic_demo (ships), synthetic, mimic_full (.gitignored), mietic

frontend/  React 18 + Vite + TypeScript + Zustand
  src/api/        Typed client mirroring the schemas
  src/store/      Encounter store (single source of client truth)
  src/workflow/   One component per stage, driven by encounter.stage
  src/components/ Reusable UI (chat, vitals panel, ESI selector, score card)
```

## Data flow

1. Backend loads a `TriageCase` via a source loader. Expert labels and full
   history facts never cross to the client before `FEEDBACK`.
2. Frontend creates an `Encounter`, then drives it stage by stage through the API.
3. During `HISTORY`, trainee turns POST to the backend, which prompts the LLM
   patient persona (grounded strictly in the case's hidden `history`) and appends
   the reply to the transcript.
4. At `FEEDBACK`, the **scoring engine** computes deterministic numbers
   (ESI accuracy with over/under-triage direction, history completeness, vitals
   acquisition, intervention recognition, outcome alignment). The LLM then writes
   a narrative *grounded in those numbers* — it never produces the scores.

## Scoring (centers the clinical problem)

`ScoreReport` headline = ESI result with `triageDirection ∈ {CORRECT, OVER_TRIAGE,
UNDER_TRIAGE}`. **Under-triage is penalized more heavily than over-triage**,
because under-triage is the specific safety failure this tool exists to reduce.
Dimensions: `ESI_ACCURACY` (highest weight), `HISTORY_COMPLETENESS` (red flags
elicited), `VITALS_ACQUISITION`, `INTERVENTION_RECOGNITION`, `OUTCOME_ALIGNMENT`
(weight 0 when the case has no real outcome).

## Data strategy & ethics

- **Ships now:** `mimic_demo` (open-access ~100-stay subset) + `synthetic`
  generator. Unblocks the whole sprint with zero credentialing.
- **After DUA:** `mimic_full` and `mietic` are `.gitignore`d loader paths with
  documented setup. No credentialed data is ever committed.
- The loader **rejects any case with `provenance.deidentified == false`**.
- No real exact ages, dates, or identifiers — age bands only (HIPAA Safe Harbor).
- The app is a **training tool, not a medical device**; this is stated in-product.

## LLM provider

Claude (Sonnet) is the default behind an abstract provider interface; OpenAI and
a local/offline provider are drop-in via env var. Patient-persona and
feedback-narrative prompts are provider-agnostic.

## Testing & quality bars

- Backend: `pytest`, `ruff`, `mypy`. State-machine transitions and scoring math
  are unit-tested exhaustively (scoring is deterministic — golden vectors).
- Frontend: `vitest`, `tsc --noEmit` (strict), `eslint`.
- A **contract test** validates that backend responses and frontend fixtures both
  conform to `shared/schemas/` — the parity guarantee across the language split.
- LLM calls are mocked in tests; no network in CI.

## Out of scope (v1)

Multi-trainee/instructor dashboards, real-time vitals waveforms, voice chat,
mobile-native apps, and any write-back to PhysioNet. Synthetic-only deployment
must remain fully functional (offline demo).
