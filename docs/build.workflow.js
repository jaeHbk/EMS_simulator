export const meta = {
  name: 'ed-triage-build',
  description: 'Build the ED Triage Trainer modules in parallel, integrate the API, then adversarially review correctness + contract parity',
  phases: [
    { title: 'Implement', detail: '6 module agents build backend (data, llm, sim, scoring) + frontend (web-core, web-stages) concurrently against the seam contract' },
    { title: 'Integrate', detail: 'Wire FastAPI app + routes + contract test on top of the backend modules' },
    { title: 'Review', detail: 'Adversarial reviewers: clinical/scoring correctness, state-machine + de-id safety, contract parity, frontend correctness' },
  ],
}

const REPO = '/Users/jaehunb/Documents/EMS_simulator'

// Every agent must ground itself in these before writing a line.
const COMMON = `
You are building ONE module of the ED Triage Trainer, a web-based emergency-department
triage training simulator. Repo root: ${REPO} (cd there).

BEFORE writing anything, Read these (they are authoritative and already on disk):
- ${REPO}/AGENTS.md  (non-negotiable rules)
- ${REPO}/CLAUDE.md  (conventions)
- ${REPO}/docs/MODULE_INTERFACES.md  (THE seam contract — your public surface + everyone else's)
- ${REPO}/docs/superpowers/specs/2026-06-09-ed-triage-trainer-design.md  (full design)
- ${REPO}/shared/schemas/*.json  (the cross-language contract)

HARD RULES (violating these is a defect):
- Stay strictly inside YOUR module's files. Depend on other modules ONLY through the
  public signatures in MODULE_INTERFACES.md + the Pydantic models in app/models/.
- Do NOT edit shared/schemas/, app/models/, app/config.py, frontend/src/api/contract.ts,
  or any other module's files. They are the fixed contract.
- Do NOT run git. Do NOT run pip install / npm install. Do NOT start servers.
- Deterministic scoring: the LLM never produces a graded number.
- Under-triage (assigning a LESS acute / higher ESI number than expert) is the headline
  safety failure — penalize it more than over-triage wherever ESI is graded.
- De-identification: loaders reject provenance.deidentified == false; age BANDS only.
- Offline-first: nothing you write may REQUIRE network or an API key to run.
- Write unit tests for your module. Make them runnable with the repo's test runner
  (pytest under backend/tests/ for Python; vitest co-located *.test.ts(x) for frontend).
- Self-check WITHOUT installing deps: for Python run \`python3 -m py_compile\` on each
  file you wrote (syntax gate; pydantic/fastapi won't import without deps — that's fine).
  For TS, re-read your files and check imports resolve against contract.ts + sibling files.
`

const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['module', 'filesWritten', 'publicSymbols', 'testsWritten', 'selfCheck', 'notes'],
  properties: {
    module: { type: 'string' },
    filesWritten: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths created/edited' },
    publicSymbols: { type: 'array', items: { type: 'string' }, description: 'exported funcs/classes other modules will import' },
    testsWritten: { type: 'array', items: { type: 'string' } },
    selfCheck: { type: 'string', description: 'exact command(s) run + result, e.g. py_compile output' },
    notes: { type: 'string', description: 'anything the integrator/reviewers must know; interface deviations (should be none)' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'verdict', 'findings'],
  properties: {
    area: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'DEFECTS_FOUND'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'detail', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'MAJOR', 'MINOR'] },
          file: { type: 'string', description: 'path:line if possible' },
          detail: { type: 'string' },
          fix: { type: 'string', description: 'concrete recommended fix' },
        },
      },
    },
  },
}

// ---------------------------------------------------------------- Phase 1: Implement
phase('Implement')

const dataPrompt = `${COMMON}
YOUR MODULE: app/data/ (owner: data). Build the source loaders that normalize every
data source into a TriageCase (app/models/triage_case.py).

Deliver:
- app/data/__init__.py
- app/data/registry.py exposing: load_cases(sources: list[str]) -> list[TriageCase];
  get_case(case_id: str) -> TriageCase (KeyError if unknown); list_case_ids(sources) -> list[str].
  It dispatches to per-source loaders and caches.
- app/data/mimic_demo.py: load() -> list[TriageCase]. Reads PhysioNet MIMIC-IV-ED Demo
  CSVs from backend/data/sources/mimic_demo/ IF present (document expected filenames in a
  README there); if absent, return [] (do NOT crash — offline-first). When it does build
  cases, enforce de-id (age bands only) and set provenance.deidentified=true.
- app/data/synthetic.py: load() -> list[TriageCase]. A deterministic generator (seedable,
  NO network, NO randomness that breaks tests — use a fixed seed) that produces a diverse,
  clinically-plausible set spanning ESI 1..5 with red flags, vitals, expert labels, and
  some with outcomes. ALSO hand-author ~10 high-quality seed cases as JSON under
  backend/data/sources/synthetic/seed/*.json (provenance.license="synthetic-generated",
  deidentified=true) and load those too. Cases must be realistic ED presentations
  (chest pain/STEMI=ESI2, sepsis, minor laceration=ESI4/5, stroke, anaphylaxis=ESI1, etc.).
- app/data/mimic_full.py and app/data/mietic.py: load() that reads from their dir if
  credentialed data is present, else raises a clear, actionable error ONLY when that source
  is explicitly enabled (registry should skip absent credentialed sources gracefully — if
  enabled but empty, surface the "place credentialed data, see README" message).
- Tests: backend/tests/test_data.py — registry returns cases, get_case round-trips,
  every loaded case validates against the TriageCase model, de-id rejection works
  (a case with deidentified=false is refused), synthetic generator is deterministic.

Make the synthetic seed cases genuinely good — reviewers will check ESI labels for clinical
plausibility. Return the structured manifest.`

const llmPrompt = `${COMMON}
YOUR MODULE: app/llm/ (owner: llm). Build the pluggable LLM provider + the two prompt surfaces.

Deliver:
- app/llm/__init__.py
- app/llm/provider.py: an LLMProvider Protocol with
  \`async def complete(self, system: str, messages: list[dict[str,str]]) -> str\`,
  concrete LocalProvider (deterministic scripted stub, NO network — this is the default and
  what tests use), AnthropicProvider and OpenAIProvider (import their SDKs lazily inside
  __init__ so the module imports fine without the SDKs installed; raise a clear error if
  selected without a key/SDK), and get_provider(settings) -> LLMProvider dispatching on
  settings.llm_provider.
- app/llm/patient.py: async patient_reply(case, history, trainee_msg, provider) -> str.
  Builds a system prompt for a PATIENT PERSONA grounded STRICTLY in case.presentation.history
  (hpi/pmh/meds/allergies/social/redFlags) + chiefComplaint. The persona answers in first
  person, reveals a fact only when the trainee asks about it, never volunteers the diagnosis
  or ESI, never invents facts outside the case. The LocalProvider path must return a sensible
  scripted answer keyed off the trainee question (e.g. keyword match on pain/duration/meds)
  so the offline demo + tests work without a real LLM.
- app/llm/feedback.py: async feedback_narrative(report, case, provider) -> str. System prompt:
  write encouraging, specific teaching feedback for a trainee, GROUNDED ONLY in the numbers in
  the ScoreReport (esi result, dimensions, missedRedFlags). MUST NOT invent or change any
  number or ESI level. Explicitly call out under-triage as a safety issue when
  report.esi.triageDirection == "UNDER_TRIAGE". LocalProvider returns a deterministic
  template-filled narrative from the report fields.
- Tests: backend/tests/test_llm.py — get_provider returns LocalProvider by default;
  patient_reply with LocalProvider answers a question and never leaks the ESI/diagnosis;
  feedback_narrative mentions under-triage when direction is UNDER_TRIAGE and contains no
  fabricated numbers. Mock/avoid all network.

Prompts live in this module (e.g. as module-level strings or a prompts.py), not inline in routes.
Return the structured manifest.`

const simPrompt = `${COMMON}
YOUR MODULE: app/sim/ (state machine) + app/store/ (SQLite). You OWN encounter transitions —
the ONLY place they are enforced.

Deliver:
- app/sim/__init__.py, app/sim/machine.py exposing exactly the MODULE_INTERFACES.md surface:
  create_encounter(case) -> Encounter (stage=CASE_LOAD, copies chiefComplaint + startedAt;
  NEVER copies case.expert into the Encounter);
  advance(enc, to: Stage) -> Encounter (forward-only along STAGE_ORDER; raise StageError on
  illegal jumps — define StageError in app/sim/machine.py or errors.py);
  record_history_turn(enc, turn) -> Encounter (only legal during HISTORY);
  measure_vitals(enc, case, fields: list[str]) -> Encounter (only during VITALS; copies the
  requested fields from case.presentation.groundTruthVitals into enc.measuredVitals; unknown
  field name -> ValueError);
  assign_esi(enc, esi: int) -> Encounter (only during ESI_ASSIGNMENT; 1..5);
  order_interventions(enc, items: list[str]) -> Encounter (only during INTERVENTIONS).
  Functions should be pure-ish: return a new/updated Encounter; validate stage legality.
- app/store/__init__.py, app/store/db.py: init_db(database_url), save_encounter(enc),
  get_encounter(id) -> Encounter using the stdlib sqlite3 module (store the Encounter as JSON
  via model_dump_json; reload via model_validate_json). No SQLAlchemy needed. Must be safe to
  call init_db repeatedly.
- Tests: backend/tests/test_sim.py (legal full walk CASE_LOAD->...->FEEDBACK works; every
  illegal transition raises StageError; expert labels never appear on the Encounter before
  FEEDBACK; measure_vitals only reveals requested fields; bad esi/field rejected) and
  backend/tests/test_store.py (save/get round-trip preserves all fields).

Return the structured manifest. Note for the integrator: feedback scoring is NOT your job
(scoring module owns it); advance(enc, FEEDBACK) just moves the stage — the API composes
scoring+narrative at the feedback route.`

const scoringPrompt = `${COMMON}
YOUR MODULE: app/scoring/ (owner: scoring). Deterministic, rule-based grading. NO LLM here.

Deliver app/scoring/__init__.py + app/scoring/engine.py exposing
score(enc: Encounter, case: TriageCase) -> ScoreReport with narrative="" (the API fills
narrative later via the llm module). Numbers must be fully deterministic and unit-tested.

Compute EsiResult: assigned=enc.esiAssigned, expert=case.expert.esi, correct=(equal),
levelsOff=assigned-expert, triageDirection: CORRECT if equal, OVER_TRIAGE if assigned<expert
(more acute than needed), UNDER_TRIAGE if assigned>expert (LESS acute — the dangerous error).

Dimensions (each score in 0..1) and DEFAULT weights — use exactly these so tests are stable:
- ESI_ACCURACY weight 0.40. Sub-score by levelsOff with UNDER penalized harder:
    0 -> 1.0; over by 1 (levelsOff=-1) -> 0.6; under by 1 (levelsOff=+1) -> 0.3;
    over by >=2 -> 0.2; under by >=2 -> 0.0.
- HISTORY_COMPLETENESS weight 0.20: fraction of case.presentation.history.redFlags that the
  trainee surfaced. Detect a red flag as surfaced if its key terms appear in the trainee's
  history turns (enc.history where role=="trainee") OR were implicitly covered — keep it
  simple + deterministic: case-insensitive substring match of each red flag's salient words.
  Populate report.missedRedFlags with the ones not surfaced. If the case has no red flags,
  score 1.0.
- VITALS_ACQUISITION weight 0.10: fraction of clinically-expected vitals the trainee measured.
  Expected set = the vitals that are non-null in case.presentation.groundTruthVitals. Score =
  measured∩expected / expected (1.0 if none expected).
- INTERVENTION_RECOGNITION weight 0.15: F1-style overlap between enc.interventionsOrdered and
  case.expert.criticalInterventions (treat ["NONE"] expert as "no interventions expected" ->
  1.0 if trainee also ordered none, penalize false positives). Define precisely + test edges.
- OUTCOME_ALIGNMENT weight 0.15: if case.outcome is None -> weight 0 and EXCLUDE from the
  normalization (renormalize remaining weights to sum 1.0). If present, a simple alignment
  heuristic (e.g. high-acuity expert ESI 1-2 should align with ADMIT/ICU/OR dispositions;
  reward consistency between assigned ESI and disposition). Document the heuristic in a
  docstring; keep deterministic.

overallPercent = round(sum(score_i * normalized_weight_i) * 100, 1).

Tests: backend/tests/test_scoring.py covering — exact ESI sub-scores for all 5 levelsOff
buckets; UNDER is strictly penalized harder than the symmetric OVER (assert
under_by_1_score < over_by_1_score); weights renormalize correctly when outcome absent (sum
to 1.0); red flag detection + missedRedFlags; vitals + intervention edge cases (empty, NONE,
exact match); overallPercent bounds 0..100. Include a "named: under_triage" test
(pytest -k under_triage must select it).

Return the structured manifest.`

const webCorePrompt = `${COMMON}
YOUR MODULE: frontend core (owner: web-core): the typed API client, the Zustand store, and the
app shell. Frontend stack: React 18 + Vite + TS (strict, noUncheckedIndexedAccess) + Zustand.
Types come from frontend/src/api/contract.ts (already written — import from there, do not redefine).

Deliver:
- frontend/src/api/client.ts: one async function per backend route in MODULE_INTERFACES.md
  (createEncounter, getEncounter, advance, postHistory, postVitals, postEsi,
  postInterventions, postFeedback), each fetching /api/... and returning Promise<Encounter>.
  Centralize fetch + JSON + error handling. Base path "/api" (Vite proxies it).
- frontend/src/store/encounterStore.ts: a Zustand store holding { encounter, loading, error }
  and async actions wrapping each client call that set the returned encounter as the single
  source of truth. Export typed selectors/hooks.
- frontend/src/App.tsx: header with the app name AND the visible disclaimer
  "Educational training tool — not a medical device. De-identified/synthetic data only.",
  a "Start new encounter" control, and it mounts <WorkflowRouter/> from
  frontend/src/workflow/WorkflowRouter.tsx (built by the web-stages owner — import it; if it
  does not exist yet at runtime that's fine, it will by integration).
- frontend/src/main.tsx: React 18 root render of <App/>.
- frontend/src/styles.css (optional, minimal, clean clinical look; design tokens, dark-friendly).
- Tests: frontend/src/store/encounterStore.test.ts (actions update encounter; mock the client
  module via vi.mock) and frontend/src/api/client.test.ts (mock global fetch; each fn hits the
  right URL/method and returns the parsed encounter).

Coordinate with web-stages ONLY through MODULE_INTERFACES.md: you provide the store + client;
they consume them. Do not implement the stage components. Return the structured manifest.`

const webStagesPrompt = `${COMMON}
YOUR MODULE: frontend workflow stages (owner: web-stages): one component per state-machine
stage + the reusable UI pieces + the router. React 18 + TS strict. Types from
frontend/src/api/contract.ts. You CONSUME the store + client built by web-core
(frontend/src/store/encounterStore.ts) ONLY via the interface in MODULE_INTERFACES.md — import
its hooks/actions; do not reach into the client directly and do not redefine the store.

Deliver under frontend/src/workflow/:
- WorkflowRouter.tsx: reads encounter.stage from the store and renders the matching stage
  component; renders a StepIndicator showing STAGE_ORDER progress. Handles the null/no-encounter
  state (prompt to start).
- CaseLoad.tsx (show chiefComplaint + "Begin history" -> advance to HISTORY)
- History.tsx (chat: trainee types, calls postHistory; renders transcript from encounter.history;
  "Proceed to vitals" -> advance)
- Vitals.tsx (pick which vitals to measure -> postVitals; show measuredVitals; advance)
- EsiAssignment.tsx (ESI 1..5 selector with short descriptors of each level -> postEsi; advance)
- Interventions.tsx (multi-select critical interventions -> postInterventions; advance to FEEDBACK)
- Feedback.tsx (render encounter.scoreReport via ScoreCard; prominently surface
  triageDirection — UNDER_TRIAGE shown as a clear safety warning; show missed red flags + narrative)
And under frontend/src/components/: ChatPanel, VitalsGrid, EsiSelector, InterventionPicker,
ScoreCard — presentational, props-driven, no direct store access (the stage passes props).

Tests (vitest + @testing-library/react), co-located *.test.tsx: WorkflowRouter picks the
component for each stage; EsiSelector calls back with the chosen level; ScoreCard renders an
UNDER_TRIAGE warning when given that direction; Feedback lists missed red flags. Use a fake
encounter object (typed via contract.ts) — do not hit the network.

Return the structured manifest.`

const impl = await parallel([
  () => agent(dataPrompt,      { label: 'backend:data',        phase: 'Implement', schema: IMPL_SCHEMA }),
  () => agent(llmPrompt,       { label: 'backend:llm',         phase: 'Implement', schema: IMPL_SCHEMA }),
  () => agent(simPrompt,       { label: 'backend:sim+store',   phase: 'Implement', schema: IMPL_SCHEMA }),
  () => agent(scoringPrompt,   { label: 'backend:scoring',     phase: 'Implement', schema: IMPL_SCHEMA }),
  () => agent(webCorePrompt,   { label: 'frontend:web-core',   phase: 'Implement', schema: IMPL_SCHEMA }),
  () => agent(webStagesPrompt, { label: 'frontend:web-stages', phase: 'Implement', schema: IMPL_SCHEMA }),
])

const implReport = impl.filter(Boolean)
log(`Implement done: ${implReport.length}/6 modules built`)

// ---------------------------------------------------------------- Phase 2: Integrate
phase('Integrate')

const apiPrompt = `${COMMON}
YOUR JOB: integrate the backend into a running FastAPI app + write the contract parity test.
The backend modules (app/data, app/llm, app/sim, app/store, app/scoring) now EXIST — Read them
first to learn their real signatures, then wire them. You MAY create app/main.py and app/api/*
only; do not modify the other modules (if one has a genuinely wrong signature vs
MODULE_INTERFACES.md, note it in your return for a reviewer — prefer adapting your calls).

Deliver:
- app/main.py: create the FastAPI app, CORS for the Vite dev origin, include the api router,
  call store.init_db at startup, expose GET /api/health.
- app/api/__init__.py + app/api/routes.py (or a few route files) implementing every route in
  MODULE_INTERFACES.md under /api:
    POST /api/encounters                -> pick a case via data.load_cases(settings.enabled_source_list)
                                           (random-but-seedable; allow optional {caseId} to force one),
                                           create_encounter, persist, return Encounter.
    GET  /api/encounters/{id}           -> load from store.
    POST /api/encounters/{id}/advance   -> sim.advance.
    POST /api/encounters/{id}/history   -> append trainee turn, call llm.patient_reply, append
                                           patient turn (sim.record_history_turn), persist.
    POST /api/encounters/{id}/vitals    -> sim.measure_vitals.
    POST /api/encounters/{id}/esi       -> sim.assign_esi.
    POST /api/encounters/{id}/interventions -> sim.order_interventions.
    POST /api/encounters/{id}/feedback  -> sim.advance to FEEDBACK, scoring.score(enc, case)
                                           for the NUMBERS, then llm.feedback_narrative to fill
                                           report.narrative, attach to encounter, persist, return.
  Routes must be THIN: validate input with small Pydantic request bodies, call modules, return
  the Encounter. Map domain errors (StageError, KeyError, ValueError) to clean HTTP 4xx.
  Keep expert labels server-side: only the feedback route reveals them (via the ScoreReport).
- backend/tests/test_contract.py: load each shared/schemas/*.json with jsonschema and validate
  that (a) a sample TriageCase from the data module, (b) an Encounter produced by the sim, and
  (c) a ScoreReport from the scoring engine all conform to their schema. This is the parity
  guarantee — it must be meaningful, not trivial.
- backend/tests/test_api.py: use fastapi.testclient.TestClient to walk a FULL encounter through
  every route end-to-end with LLM_PROVIDER=local (no network), asserting stage progression and a
  final ScoreReport. Assert expert labels are NOT present in any pre-FEEDBACK response body.

Run python3 -m py_compile on every file you write. Return a manifest:
filesWritten, publicSymbols (routes), testsWritten, selfCheck (py_compile result), notes.`

const integration = await agent(apiPrompt, { label: 'backend:api+contract', phase: 'Integrate', schema: IMPL_SCHEMA })
log(`Integrate done: ${integration ? integration.filesWritten.length + ' files' : 'FAILED'}`)

// ---------------------------------------------------------------- Phase 3: Review (adversarial, parallel)
phase('Review')

const reviewClinical = `${COMMON}
You are an ADVERSARIAL clinical-correctness reviewer. Do NOT write feature code. Read the
scoring engine (app/scoring/engine.py) and the data module's synthetic seed cases + generator
(app/data/synthetic.py, backend/data/sources/synthetic/seed/*.json) and the tests.

Check, citing file:line:
- ESI sub-scoring: is UNDER-triage STRICTLY penalized more than the symmetric OVER-triage?
  (under-by-1 score < over-by-1 score; under-by-2 <= over-by-2). triageDirection mapping correct
  (assigned>expert => UNDER_TRIAGE)?
- Dimension weights renormalize to sum 1.0 when case.outcome is None (OUTCOME_ALIGNMENT excluded)?
- overallPercent always within 0..100? Any divide-by-zero (no red flags / no expected vitals /
  empty intervention sets / all weights excluded)?
- Synthetic seed cases: are the ESI labels clinically PLAUSIBLE for the described presentation?
  Flag any mislabeled case (e.g. anaphylaxis labeled ESI 4). Are red flags + criticalInterventions
  coherent with the complaint? Is every case de-identified (age bands, deidentified=true)?
Return the review verdict + concrete findings with fixes.`

const reviewSafety = `${COMMON}
You are an ADVERSARIAL state-machine + data-safety reviewer. Do NOT write feature code. Read
app/sim/machine.py, app/store/db.py, app/data/*.py, app/api/routes.py (and main.py), and tests.

Check, citing file:line:
- Is it possible for case.expert (ESI / rationale / criticalInterventions) to reach the client
  BEFORE stage==FEEDBACK through ANY route or the Encounter model? Trace the feedback route and
  every response. Flag any leak.
- Are ALL illegal stage transitions rejected (forward-only; no skipping; no acting in the wrong
  stage)? Any transition not guarded?
- De-id enforcement: do loaders actually REJECT provenance.deidentified==false (not just rely on
  the data being clean)? Any exact ages/dates leaking instead of bands?
- Offline-first: does anything import an LLM SDK at module top-level (breaks no-deps import)?
  Does the default path truly avoid network?
- Credentialed loaders: do they fail safe (clear actionable error) and never crash the app when
  their data dir is empty?
Return the review verdict + concrete findings with fixes.`

const reviewParity = `${COMMON}
You are an ADVERSARIAL contract-parity reviewer. Do NOT write feature code. Compare, field by
field, the THREE embodiments of the contract:
  shared/schemas/{triage-case,encounter,score-report}.schema.json
  app/models/{triage_case,encounter,score}.py
  frontend/src/api/contract.ts
For each type, check every field name, type, nullability, enum membership, and required-ness
matches across all three. Also confirm backend/tests/test_contract.py meaningfully validates
real objects against the schemas (not a trivial/always-true test). Cite file:line for any
mismatch and give the exact fix. Return verdict + findings.`

const reviewFrontend = `${COMMON}
You are an ADVERSARIAL frontend reviewer. Do NOT write feature code. Read frontend/src/api/client.ts,
frontend/src/store/encounterStore.ts, frontend/src/workflow/*, frontend/src/components/*, App.tsx.

Check, citing file:line:
- Does WorkflowRouter render a component for EVERY Stage in STAGE_ORDER (no missing/duplicated
  stage; exhaustive switch)?
- Is the Zustand store the single source of truth (stages don't fetch directly / hold duplicate
  encounter state)?
- Does Feedback/ScoreCard prominently surface UNDER_TRIAGE as a safety warning (not just a neutral
  label)? Are missed red flags + narrative shown?
- Is the "not a medical device" disclaimer present and visible in App?
- Any TS strictness problem likely to fail tsc (noUncheckedIndexedAccess, missing null checks,
  implicit any, unhandled undefined from array access)?
Return verdict + findings with fixes.`

const reviews = await parallel([
  () => agent(reviewClinical, { label: 'review:clinical+scoring', phase: 'Review', schema: REVIEW_SCHEMA }),
  () => agent(reviewSafety,   { label: 'review:sim+data-safety',  phase: 'Review', schema: REVIEW_SCHEMA }),
  () => agent(reviewParity,   { label: 'review:contract-parity',  phase: 'Review', schema: REVIEW_SCHEMA }),
  () => agent(reviewFrontend, { label: 'review:frontend',         phase: 'Review', schema: REVIEW_SCHEMA }),
])

const reviewReport = reviews.filter(Boolean)

return {
  implemented: implReport,
  integration,
  reviews: reviewReport,
  summary: {
    modules: implReport.length,
    integrated: Boolean(integration),
    reviewVerdicts: reviewReport.map((r) => ({ area: r.area, verdict: r.verdict, findings: r.findings.length })),
    criticalFindings: reviewReport.flatMap((r) => r.findings.filter((f) => f.severity === 'CRITICAL')),
  },
}
