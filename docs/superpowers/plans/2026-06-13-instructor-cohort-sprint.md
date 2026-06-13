# Instructor / Cohort Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task = one verified, gated commit + push. Steps use `- [ ]`.

**Goal:** Let an instructor see a whole cohort's triage performance (aggregate under-triage rate, per-difficulty, per-trainee breakdown) — the natural extension of the per-trainee analytics already shipped. Turns the tool from a solo trainer into a classroom instrument, WITHOUT adding authentication.

**Architecture:** A "cohort" is an **opaque cohort code** — the exact no-auth pattern already used for `traineeId`. An encounter optionally carries a `cohortId`; the store can query by it; a pure aggregator computes `CohortAnalytics` (cohort-level rates + per-difficulty + a per-trainee summary list); an endpoint serves it; the frontend gets a "join cohort" control and an instructor view. Everything additive + contract-first, mirroring the trainee-analytics path. NO assignable case sets / roster this sprint (that needs a new persistence concept — deferred).

**Tech stack:** Python FastAPI/Pydantic/SQLite (backend), React/Vite/TS/Zustand/shadcn (frontend). No new deps. Reuses `compute_analytics`'s direction-counting logic.

**Hard rules (AGENTS.md/CLAUDE.md):** contract-first (schema → Pydantic → contract.ts + ajv for anything crossing to the client); deterministic (no LLM in analytics); expert labels server-side until FEEDBACK (analytics is post-FEEDBACK, fine); de-id (cohortId/traineeId are opaque keys, NOT identities — document); offline-first; additive so the 216 backend / 118 frontend tests stay green.

**Per-task gate:** backend `cd backend && . .venv/bin/activate && ruff check . && mypy app && pytest -q`; frontend `cd frontend && npm run typecheck && npm run lint && npm run test && npm run build`. Commit (Conventional Commits) + `git push origin main`. Confirm CI green. Run gates YOURSELF; never trust a self-report. **Commit on `main` (do NOT branch).**

**Baseline:** backend 216, frontend 118, clean on `main`.

---

## Task order & conflicts

| # | Task | Touches |
|---|------|---------|
| 1 | cohortId on Encounter + store query | schema, models, contract.ts, store/db.py, sim/machine.py, api/routes.py (create), tests |
| 2 | CohortAnalytics contract + endpoint | new schema, models, contract.ts, scoring/cohort.py (new pure aggregator), api/routes.py, tests |
| 3 | Frontend: join-cohort + instructor view | client.ts, store, lib/cohortId.ts (new), CohortPanel (new), App.tsx, tests |

Strictly sequential (1→2→3): each builds on the prior's contract. Backend (1,2) before frontend (3).

---

## Task 1: `cohortId` on Encounter + store query

**Why:** Encounters must be groupable into a cohort to aggregate them. Mirror the `traineeId` mechanism exactly (opaque, optional, additive).

**Files:** `shared/schemas/encounter.schema.json`, `backend/app/models/encounter.py`, `frontend/src/api/contract.ts`, `backend/app/store/db.py`, `backend/app/sim/machine.py`, `backend/app/api/routes.py`, `backend/tests/test_api.py`, `frontend/src/api/contract-schema.test.ts`.

- [ ] **Step 1: Add `cohortId` to the Encounter contract (SCHEMA FIRST, optional).** In `encounter.schema.json` properties (NOT required): `"cohortId": { "type": ["string","null"], "description": "Opaque cohort code grouping encounters for an instructor's aggregate view. Not an identity or credential." }`. Mirror `cohortId: str | None = None` in the `Encounter` Pydantic model (right after `traineeId`) and `cohortId: string | null` (optional, mirroring `traineeId?`) in `contract.ts` `Encounter`. Run both contract-parity tests (`test_contract.py`, `contract-schema.test.ts`) → green.

- [ ] **Step 2: Thread it through create.** `sim.machine.create_encounter` gains `cohort_id: str | None = None` (sets `enc.cohortId`), mirroring the existing `trainee_id` param. `CreateEncounterBody` (routes.py) gains optional `cohortId: str | None = None`; `create_encounter` route passes it to `sim.create_encounter`. Existing callers (no cohortId) unaffected — default None.

- [ ] **Step 3: Store query.** `store/db.py`: `list_encounters_by_cohort(cohort_id: str) -> list[Encounter]` mirroring `list_encounters_by_trainee` (full-table scan via `_operation()`, filter on `cohortId`, oldest-first by `startedAt`, None first). Export in `db.py __all__` + `store/__init__.py`.

- [ ] **Step 4: Tests.** `test_api.py`: create an encounter with a `cohortId`, confirm it round-trips on the returned Encounter; a store test that `list_encounters_by_cohort` returns the matching encounters in order and excludes others. `contract-schema.test.ts`: add `cohortId` to the encounter fixtures (one with, one null).

- [ ] **Step 5: Gate both sides. Commit + push.**
```
git commit -m "feat(cohort): optional cohortId on Encounter + store query-by-cohort

Encounters can carry an opaque cohortId (like traineeId — a grouping key, not an
identity/credential), additive across schema/model/contract.ts. Add
store.list_encounters_by_cohort mirroring the by-trainee query. Threaded through
create_encounter; existing callers unaffected (default None)."
```

---

## Task 2: `CohortAnalytics` contract + endpoint

**Why:** The instructor needs cohort-level aggregates: overall under-triage rate, per-difficulty, and a per-trainee row so they can spot who's struggling.

**Files:** new `shared/schemas/cohort-analytics.schema.json`, `backend/app/models/cohort.py` (new), `backend/app/models/__init__.py`, `backend/app/scoring/cohort.py` (new pure aggregator), `backend/app/api/routes.py`, `frontend/src/api/contract.ts`, `frontend/src/api/contract-schema.test.ts`, `backend/tests/test_cohort.py` (new) + `test_api.py`.

- [ ] **Step 1: Define the CohortAnalytics contract (SCHEMA FIRST).** New `cohort-analytics.schema.json` defining `CohortAnalytics`:
  - `cohortId: string`, `totalTrainees: integer`, `totalEncounters: integer`,
  - `underTriageRate`/`overTriageRate`/`correctRate`: number 0..1, `meanLevelsOffAbs`: number,
  - `byDifficulty`: reuse the SAME `{trap, standard: {totalEncounters, underTriageRate}}` shape as TraineeAnalytics (define a shared `difficultyStats` def, or duplicate the small shape — keep it consistent with analytics.schema.json),
  - `trainees`: array of per-trainee rows `{ traineeId: string, totalEncounters: integer, underTriageRate: number, correctRate: number }`.
  Mirror in `backend/app/models/cohort.py` (`CohortTraineeRow`, `CohortAnalytics`; reuse `DifficultyStats`/`ByDifficulty` from `app/models/analytics.py` — import them, don't redefine). Export from `models/__init__.py`. Add matching TS interfaces (`CohortTraineeRow`, `CohortAnalytics`) to `contract.ts`.

- [ ] **Step 2: Pure aggregator (`app/scoring/cohort.py`).** `compute_cohort_analytics(cohort_id: str, encounters: list[Encounter], difficulty_by_case: dict[str, str | None] | None = None) -> CohortAnalytics`. Pure, no I/O. Consider only FEEDBACK + scoreReport encounters. Compute: cohort-level direction rates + meanLevelsOffAbs (reuse the counting approach from `app/scoring/analytics.py` — consider a tiny shared helper if it reduces duplication, but keep `analytics.py` working; duplication of a few lines is acceptable over a risky refactor). `totalTrainees` = distinct `traineeId` among scored encounters (None traineeId grouped under a sentinel like "(anonymous)" or excluded — document; recommend grouping None under "(anonymous)"). `byDifficulty` via the difficulty map (same bucketing as TraineeAnalytics: TRAP→trap, else standard). `trainees`: one row per distinct traineeId with that trainee's encounter count + under/correct rates, sorted by underTriageRate DESC (struggling trainees first — the instructor's signal), tie-broken by traineeId for determinism. Empty/unknown cohort → zeroed CohortAnalytics (not 404).

- [ ] **Step 3: Endpoint.** Add `GET /cohort/{cohort_id}/analytics` to the router (reachable at `/api/...` and `/api/v1/...` via the dual-mount). Thin: `store.list_encounters_by_cohort` → resolve `difficulty_by_case` via `data.get_case` (catch KeyError → None, like the trainee analytics route) → `compute_cohort_analytics`. Returns `CohortAnalytics`. Document it exposes aggregates + opaque trainee codes only (no PII, no per-encounter content beyond counts/rates).

- [ ] **Step 4: Tests.** `test_cohort.py` (new): unit-test `compute_cohort_analytics` deterministically — e.g. 2 trainees in a cohort, one with an under-triage + one correct, assert cohort rates, totalTrainees=2, trainees rows sorted by underTriageRate desc, byDifficulty buckets. `test_api.py`: create several encounters under one cohortId across ≥2 traineeIds, walk to FEEDBACK forcing mixed directions, `GET /api/v1/cohort/{id}/analytics`, assert the aggregate + per-trainee rows + unknown-cohort-returns-zeroed. `contract-schema.test.ts`: a CohortAnalytics fixture validated against the schema.

- [ ] **Step 5: Gate both sides. Commit + push.**
```
git commit -m "feat(cohort): cohort analytics endpoint (aggregate + per-trainee under-triage)

GET /cohort/{id}/analytics returns deterministic cohort-level under-triage / over /
correct rates, per-difficulty segmentation, and a per-trainee breakdown sorted by
under-triage rate (struggling trainees first) — the instructor's signal. New pure
compute_cohort_analytics + CohortAnalytics contract (schema + Pydantic + TS + ajv),
reusing the difficulty/direction logic. Opaque trainee codes + aggregates only; no PII."
```

---

## Task 3: Frontend join-cohort control + instructor view

**Why:** Surface cohort mode in the UI: a trainee can join a cohort (so their encounters are tagged), and an instructor can view the cohort dashboard.

**Files:** `frontend/src/lib/cohortId.ts` (new), `frontend/src/api/client.ts`, `frontend/src/store/encounterStore.ts`, `frontend/src/components/CohortPanel.tsx` (new), `frontend/src/App.tsx`, tests.

- [ ] **Step 1: Cohort id lib + client.** `src/lib/cohortId.ts`: `getCohortId(): string | null` (reads `ed-triage-cohort` from localStorage; null when unset — joining is opt-in, unlike traineeId which always exists), `setCohortId(code: string)`, `clearCohortId()`. Mirror theme/trainee localStorage try/catch. In `client.ts`: `getCohortAnalytics(cohortId): Promise<CohortAnalytics>` → `GET /cohort/{encodeURIComponent(cohortId)}/analytics`; add to `apiClient` + `ApiClient`. `createEncounter` must include `cohortId` when set: extend its body (the store passes it).

- [ ] **Step 2: Store wiring.** `encounterStore.ts`: when creating an encounter, include the current `getCohortId()` (alongside the existing traineeId) in the create call. Add `cohortAnalytics: CohortAnalytics | null` state + `fetchCohortAnalytics(): Promise<void>` (calls client when a cohort id is set; no-op/null when not). Expose via selectors/hooks. Keep existing signatures.

- [ ] **Step 2b: client.ts createEncounter signature.** It's currently `createEncounter(sources?, traineeId?)`. Extend to also carry cohortId without breaking the existing positional calls in `client.test.ts` — cleanest: `createEncounter(sources?: string[], traineeId?: string, cohortId?: string)` (append optional 3rd param; include in body only when present). Verify the existing client tests still pass.

- [ ] **Step 3: CohortPanel + join control.** `CohortPanel.tsx` (presentational, props `{ analytics: CohortAnalytics | null }`): a shadcn card showing cohort headline under-triage rate (destructive color), totalTrainees/totalEncounters, the per-difficulty split, and a small table of per-trainee rows (traineeId truncated, under-triage rate, encounters) — struggling trainees at top. a11y: color always paired with text. Empty state when null. A "join cohort" control in `App.tsx` (an input + button on the no-encounter screen): set/clear the cohort code (localStorage), and when a cohort is active show the CohortPanel (fetch on mount + when the code changes / after FEEDBACK). Keep the existing ProgressPanel + disclaimer + start flow.

- [ ] **Step 4: Tests.** `CohortPanel.test.tsx`: renders the aggregate + a row per trainee, struggling-first order, under-triage in destructive styling with a non-color cue; empty state. Store test: `fetchCohortAnalytics` sets state from a mock client; create includes cohortId when set. Extend client.test if needed for the new param. Keep all green.

- [ ] **Step 5: Gate. Commit + push.**
```
git commit -m "feat(web): join-cohort control + instructor cohort dashboard"
```

---

## Self-Review

**Coverage vs chosen track (instructor/cohort mode):** group encounters by cohort → Task 1; cohort aggregate + per-trainee analytics → Task 2; join control + instructor view → Task 3. Assignable case sets / roster explicitly DEFERRED (needs new persistence; out of scope, documented).

**No-auth discipline:** cohortId is an opaque code (localStorage), same model as traineeId — NOT authentication, NOT an identity. Documented in the schema + models. No login/session/security scope creep this sprint.

**Additive-safety:** Tasks 1–2 add optional fields + new endpoints/types; existing 216 backend / 118 frontend + both contract-parity tests stay green. `compute_analytics` (per-trainee) untouched; `compute_cohort_analytics` is net-new and reuses `DifficultyStats`/`ByDifficulty` by import (no redefinition).

**Contract discipline:** cohortId (Encounter) + CohortAnalytics both cross to the client → schema + Pydantic + contract.ts + ajv, all layers. Reuse the existing difficultyStats shape for consistency.

**Determinism:** the per-trainee rows are sorted underTriageRate DESC, tie-broken by traineeId, so output is stable/testable. Unknown cohort → zeroed, never 404 (matches the trainee analytics convention).

**Ordering:** 1 (cohortId + store) → 2 (aggregate + endpoint, depends on the store query) → 3 (frontend, depends on the endpoint + contract). Each gated + CI-confirmed before the next.

**Risk flags:** lowest-risk sprint of the four — pure additive, mirrors an existing proven path (trainee analytics). Main watch item: don't break the existing `createEncounter` positional-arg tests when adding cohortId (append optional param). The dual-mount from the prior sprint means the new endpoint is automatically at both `/api` and `/api/v1` — confirm in the test.
