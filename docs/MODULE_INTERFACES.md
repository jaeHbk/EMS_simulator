# Module Interfaces (the seam contract)

This file is the fixed point that lets independent agents build modules in parallel
without colliding. Each module exposes the public surface below; other modules
depend **only** on these signatures (plus `shared/schemas/` and the Pydantic models
in `app/models/`). If you need to change a signature here, that's a coordination
event — flag it, don't silently diverge.

Status legend: ✅ exists (shared base) · 🔨 to be built by a module owner.

---

## Backend

### `app/models/` ✅
Pydantic models mirroring the schemas: `TriageCase`, `Encounter`, `Stage`,
`STAGE_ORDER`, `HistoryTurn`, `Vitals`, `ScoreReport`, `EsiResult`,
`ScoreDimension`, `TriageDirection`, `CriticalIntervention`. Read-mostly.

### `app/config.py` ✅
`get_settings() -> Settings`. Fields: `llm_provider`, `*_api_key`, `*_model`,
`enabled_source_list`, `database_url`.

### `app/data/` 🔨 — owner: **data**
Loaders that turn each source into `TriageCase`. Public surface:
```python
# app/data/registry.py
def load_cases(sources: list[str]) -> list[TriageCase]: ...
def get_case(case_id: str) -> TriageCase: ...        # raises KeyError if unknown
def list_case_ids(sources: list[str]) -> list[str]: ...
```
- One module per source: `mimic_demo.py`, `synthetic.py`, `mimic_full.py`, `mietic.py`.
- Each exposes `load() -> list[TriageCase]`.
- **Must** reject `provenance.deidentified is False` and emit only age bands.
- Ships real bundled data under `backend/data/sources/mimic_demo/` (open) and a
  generator for `synthetic/`. `mimic_full`/`mietic` loaders raise a clear "place
  credentialed data" error when their dir is empty.

### `app/llm/` 🔨 — owner: **llm**
Pluggable provider + the two prompt surfaces. Public:
```python
# app/llm/provider.py
class LLMProvider(Protocol):
    async def complete(self, system: str, messages: list[dict[str, str]]) -> str: ...

def get_provider(settings: Settings) -> LLMProvider: ...   # anthropic|openai|local

# app/llm/patient.py
async def patient_reply(case: TriageCase, history: list[HistoryTurn],
                        trainee_msg: str, provider: LLMProvider) -> str: ...

# app/llm/feedback.py  — narrative ONLY, never numbers
async def feedback_narrative(report: ScoreReport, case: TriageCase,
                             provider: LLMProvider) -> str: ...
```
- `local` provider is a deterministic scripted stub (no network) so tests + offline
  demo work. The patient persona answers strictly from `case.presentation.history`.

### `app/sim/` 🔨 — owner: **sim**
The encounter state machine — the ONLY place transitions are enforced. Public:
```python
# app/sim/machine.py
def create_encounter(case: TriageCase) -> Encounter: ...
def advance(enc: Encounter, to: Stage) -> Encounter: ...   # validates forward-only
def record_history_turn(enc: Encounter, turn: HistoryTurn) -> Encounter: ...
def measure_vitals(enc: Encounter, case: TriageCase, fields: list[str]) -> Encounter: ...
def assign_esi(enc: Encounter, esi: int) -> Encounter: ...
def order_interventions(enc: Encounter, items: list[str]) -> Encounter: ...
```
- Rejects illegal transitions (raise `StageError`). Never copies `case.expert` into
  the `Encounter` before `FEEDBACK`.

### `app/scoring/` 🔨 — owner: **scoring**
Deterministic grading. Public:
```python
# app/scoring/engine.py
def score(enc: Encounter, case: TriageCase) -> ScoreReport: ...   # numbers only, narrative=""
```
- Computes `EsiResult` incl. `triageDirection`; **under-triage penalized heavier**.
- Dimensions: ESI_ACCURACY (top weight), HISTORY_COMPLETENESS (red flags elicited
  from transcript), VITALS_ACQUISITION, INTERVENTION_RECOGNITION, OUTCOME_ALIGNMENT
  (weight 0 when `case.outcome is None`). `overallPercent` = weighted sum × 100.
- Leaves `narrative=""`; the API layer fills it via `app/llm/feedback.py`.

### `app/store/` 🔨 — owner: **sim** (small)
SQLite persistence:
```python
# app/store/db.py
def save_encounter(enc: Encounter) -> None: ...
def get_encounter(encounter_id: str) -> Encounter: ...
def init_db(database_url: str) -> None: ...
```

### `app/api/` + `app/main.py` 🔨 — owner: **api**
FastAPI app wiring everything. Routes (all under `/api`):
```
POST /api/encounters            {sources?} -> Encounter        (picks a case, CASE_LOAD)
GET  /api/encounters/{id}                  -> Encounter
POST /api/encounters/{id}/advance {to}     -> Encounter
POST /api/encounters/{id}/history {text}   -> Encounter        (appends trainee+patient turns)
POST /api/encounters/{id}/vitals  {fields} -> Encounter
POST /api/encounters/{id}/esi     {esi}    -> Encounter
POST /api/encounters/{id}/interventions {items} -> Encounter
POST /api/encounters/{id}/feedback         -> Encounter        (runs scoring + narrative)
```
- Routes are thin: call `sim` / `data` / `scoring` / `llm` / `store`. No logic here.
- `feedback` is where scoring (numbers) + llm (narrative) compose.

---

## Frontend

### `src/api/contract.ts` ✅
All shared types (`Encounter`, `Stage`, `STAGE_ORDER`, `Vitals`, `ScoreReport`, …).

### `src/api/client.ts` 🔨 — owner: **web-core**
Typed fetch wrapper, one function per backend route, all returning `Encounter`.

### `src/store/encounterStore.ts` 🔨 — owner: **web-core**
Zustand store: single client source of truth. Holds the current `Encounter`, async
actions that call the client and set the returned encounter, loading/error flags.

### `src/workflow/` 🔨 — owner: **web-stages**
One component per stage, switched on `encounter.stage`:
`CaseLoad.tsx`, `History.tsx`, `Vitals.tsx`, `EsiAssignment.tsx`,
`Interventions.tsx`, `Feedback.tsx`, plus `WorkflowRouter.tsx` that selects by stage
and a `StepIndicator`. Stages read/act via the store only.

### `src/components/` 🔨 — owner: **web-stages**
Reusable presentational pieces: `ChatPanel`, `VitalsGrid`, `EsiSelector`,
`InterventionPicker`, `ScoreCard`. Pure-ish, props-driven.

### `src/main.tsx`, `src/App.tsx` 🔨 — owner: **web-core**
App entry; `App` mounts `WorkflowRouter` and a header with the
"training tool, not a medical device" disclaimer.
