# Data + Analytics + UX Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task = one verified, gated commit + push. Steps use `- [ ]`.

**Goal:** Realize real MIMIC data flow + the headline learning-curve metric (track (a)), and polish the trainee/demo experience (track (c)).

**Architecture:** Sequential tasks (they share `encounterStore.ts` / `App.tsx` / `ChatPanel.tsx`, so NOT parallel). Contract changes are **additive + schema-first** (optional fields with defaults) so the existing 170 backend / 62 frontend tests + both contract-parity tests stay green. The analytics identity is a **per-browser trainee id** (localStorage), threaded onto the `Encounter` so the server aggregates per learner.

**Tech stack:** Python FastAPI/Pydantic/SQLite (backend); React 18 / Vite / TS strict / Zustand / shadcn (frontend). No new runtime deps (analytics chart uses inline SVG/CSS, not a charting library).

**Hard rules (AGENTS.md/CLAUDE.md):** contract-first (schema → Pydantic → contract.ts); deterministic scoring (LLM never produces a number); under-triage penalized hardest; expert labels/hidden history server-side until FEEDBACK; de-id enforced in code; offline-first (no key/network → runs; CI never hits network).

**Per-task gate (run yourself, read the output — never trust a self-report):**
- Backend touched: `cd backend && . .venv/bin/activate && ruff check . && mypy app && pytest -q`
- Frontend touched: `cd frontend && npm run typecheck && npm run lint && npm run test && npm run build`
- Commit (Conventional Commits), then `git push origin main`. Confirm CI green.

---

## Task order & file-conflict map

| # | Task | Touches (conflict-sensitive) |
|---|------|------|
| 1 | Real MIMIC demo flow + gradableDimensions | backend: data/, scoring/engine.py, schema, models, tests (backend-isolated) |
| 2 | traineeId contract + store query + analytics endpoint | schema, models, **contract.ts**, store/db.py, api/routes.py, tests |
| 3 | Analytics "My progress" view | **encounterStore.ts**, **App.tsx**, new component, tests |
| 4 | Streaming / optimistic chat | **encounterStore.ts**, **ChatPanel.tsx**, History.tsx |
| 5 | Session resume | **encounterStore.ts**, **App.tsx** |
| 6 | Accessibility pass | **App.tsx**, **ChatPanel.tsx**, WorkflowRouter.tsx |
| 7 | Printable / exportable debrief | Feedback.tsx, ScoreCard.tsx, index.css |

Run strictly in order. Each subagent re-reads the current file state.

---

## Task 1: Real MIMIC-IV-ED Demo data flow + per-case gradable dimensions

**Why:** README now says "fetch locally," but nobody has run it — "grounded in MIMIC" is unverified. And raw MIMIC cases have no curated red flags / interventions, so HISTORY_COMPLETENESS + INTERVENTION_RECOGNITION would score on absent data. Make real data flow AND make scoring honest about which dimensions a case supports.

**Files:** Modify `shared/schemas/triage-case.schema.json`, `backend/app/models/triage_case.py`, `backend/app/scoring/engine.py`, `backend/app/data/_mimic_format.py`, `backend/tests/test_scoring.py`, `backend/tests/test_data.py`. (TriageCase is server-side only → NO contract.ts change.)

- [ ] **Step 1: Fetch + verify the real loader (local only, not committed).** Run `python backend/scripts/fetch_mimic_demo.py`; confirm CSVs land + PROVENANCE.json written. Then `ENABLED_SOURCES=mimic_demo python -c "from app.data import registry; cs=registry.load_cases(['mimic_demo']); print(len(cs), cs[0].caseId, cs[0].expert.esi)"` — confirm real cases load + validate as TriageCase. Record the count in the commit message. (Data stays gitignored.)

- [ ] **Step 2: Add `gradableDimensions` to the contract (SCHEMA FIRST, optional).** In `triage-case.schema.json` top-level `properties` (NOT in `required`):
```json
"gradableDimensions": {
  "type": ["array", "null"],
  "items": { "type": "string", "enum": ["ESI_ACCURACY","HISTORY_COMPLETENESS","VITALS_ACQUISITION","INTERVENTION_RECOGNITION","OUTCOME_ALIGNMENT"] },
  "description": "If set, only these scoring dimensions are graded+weighted; others are excluded from normalization. null = grade all (synthetic default). Used for sources (MIMIC) that lack curated red-flags/interventions."
}
```
Mirror in `TriageCase` (Pydantic): `gradableDimensions: list[str] | None = None`. Run `pytest tests/test_contract.py -q` → stays green (optional/null).

- [ ] **Step 3: Honor it in `engine.py` (reuse the existing exclusion mechanism).** The engine already excludes OUTCOME_ALIGNMENT (weight 0, dropped from normalization) when `case.outcome is None`. Extend `score()`: after building all dimensions, if `case.gradableDimensions is not None`, drop any dimension whose `key` is not in that list BEFORE the renormalization step (so remaining weights renormalize to 1.0). When `None`, behavior is byte-identical to today (synthetic unchanged). Do NOT change `_esi_subscore` or the empty-red-flags→1.0 / empty-interventions semantics. Add a `missedRedFlags` guard: if HISTORY_COMPLETENESS is excluded, `missedRedFlags` should be empty.

- [ ] **Step 4: Have the MIMIC formatter set it.** In `_mimic_format.load_cases`, set `gradableDimensions=["ESI_ACCURACY","VITALS_ACQUISITION","OUTCOME_ALIGNMENT"]` on each built case (MIMIC has no curated red flags / expert interventions). Synthetic + seed cases leave it unset (None → all dims).

- [ ] **Step 5: Tests.** In `test_scoring.py`: a case with `gradableDimensions=["ESI_ACCURACY","VITALS_ACQUISITION"]` scores only those two (weights renormalize to 1.0; assert HISTORY/INTERVENTION/OUTCOME absent from `report.dimensions`); a case with `None` scores exactly as today (re-assert an existing weight-sum). In `test_data.py` (reuse the `_write_mimic_fixture` CSV-fixture pattern from `test_contract.py`): a MIMIC-loaded case has `gradableDimensions` set and excludes history/intervention.

- [ ] **Step 6: Gate (backend) + frontend `npm run test` once (must stay 62; engine detail/shape unchanged for synthetic). Commit + push.**
```
git commit -m "feat(scoring): per-case gradableDimensions so real-MIMIC cases score only supported dimensions

Verified the open MIMIC-IV-ED Demo loads end-to-end (N cases) via fetch_mimic_demo.py.
Raw MIMIC lacks curated red-flags/interventions, so the loader marks those cases
gradable on ESI/vitals/outcome only; the engine excludes ungradable dimensions from
weight normalization (same mechanism as the no-outcome case). Additive + optional
(null = grade all); synthetic scoring byte-unchanged."
```

---

## Task 2: traineeId contract + store query + analytics endpoint

**Why:** The headline claim is "reduces under-triage rate," but there's no per-learner trend. Tag encounters with a per-browser trainee id and compute the learning curve server-side (deterministic, testable, publication-grade).

**Files:** `shared/schemas/encounter.schema.json`, NEW `shared/schemas/analytics.schema.json`, `backend/app/models/encounter.py`, NEW `backend/app/models/analytics.py`, `backend/app/models/__init__.py`, `frontend/src/api/contract.ts`, `backend/app/store/db.py`, `backend/app/api/routes.py`, `backend/tests/test_api.py`, `frontend/src/api/contract-schema.test.ts`.

- [ ] **Step 1: Add `traineeId` to the Encounter contract (SCHEMA FIRST, optional).** In `encounter.schema.json` properties (NOT required): `"traineeId": { "type": ["string","null"], "description": "Opaque per-browser learner id for progress analytics. Not an identity/credential." }`. Mirror `traineeId: str | None = None` in the `Encounter` Pydantic model and `traineeId: string | null` in `contract.ts` `Encounter`.

- [ ] **Step 2: Accept it on create.** `CreateEncounterBody` gets optional `traineeId: str | None = None`; `create_encounter` threads it onto the Encounter built by `sim.create_encounter` (add a `trainee_id` param to `create_encounter`, default None, set `enc.traineeId`). Existing callers/tests unaffected (default None).

- [ ] **Step 3: Define the analytics contract.** NEW `shared/schemas/analytics.schema.json` (`TraineeAnalytics`): `traineeId: str`, `totalEncounters: int`, `underTriageRate/overTriageRate/correctRate: number 0..1`, `meanLevelsOffAbs: number`, `history: array of { encounterId, startedAt(string|null), triageDirection, esiAssigned(int|null), esiExpert(int), overallPercent }`. NEW `backend/app/models/analytics.py` (`TraineeAnalytics`, `AnalyticsPoint`) mirroring it; export from `models/__init__.py`. Add the TS `TraineeAnalytics`/`AnalyticsPoint` types to `contract.ts`.

- [ ] **Step 4: Store query.** `store/db.py`: `list_encounters_by_trainee(trainee_id: str) -> list[Encounter]` (read all rows, filter by `traineeId`, ordered by `startedAt`). Keep it simple (SQLite demo scale).

- [ ] **Step 5: Analytics route.** `GET /api/analytics/{trainee_id}` → load that trainee's FEEDBACK-stage encounters (those with a scoreReport), compute the rates deterministically from each `scoreReport.esi.triageDirection` + `levelsOff`, return `TraineeAnalytics`. Empty/unknown trainee → zeroed object (not 404). Thin route; computation in a small helper (in `app/scoring/` or inline — keep deterministic + unit-testable).

- [ ] **Step 6: Tests.** `test_api.py`: create 3 encounters for one traineeId, walk them to FEEDBACK with mixed ESI choices (one correct, one under, one over), GET analytics, assert the rates + history length + ordering. Assert an unknown trainee returns zeros. Frontend `contract-schema.test.ts`: add a `TraineeAnalytics` fixture validated against `analytics.schema.json` (proves TS↔schema parity).

- [ ] **Step 7: Gate both sides. Commit + push.**
```
git commit -m "feat(analytics): per-trainee learning-curve endpoint + traineeId on Encounter

Encounters carry an optional per-browser traineeId (additive/optional across schema,
model, contract.ts). New GET /api/analytics/{traineeId} computes under-triage /
over-triage / correct rates + mean |levelsOff| + a chronological per-encounter
history deterministically from stored ScoreReports — the headline learning-curve
metric. New TraineeAnalytics contract (schema + Pydantic + TS, ajv-validated)."
```

---

## Task 3: Analytics "My progress" frontend view

**Why:** Surface the learning curve in the UI (the demo's evidence that it works).

**Files:** `frontend/src/store/encounterStore.ts`, `frontend/src/App.tsx`, NEW `frontend/src/components/ProgressPanel.tsx`, NEW `frontend/src/lib/traineeId.ts`, tests.

- [ ] **Step 1: Trainee id.** NEW `lib/traineeId.ts`: `getTraineeId(): string` minting + persisting `trainee-<uuid>` in localStorage (mirror theme-provider's storage pattern; `crypto.randomUUID()` with a fallback). Store passes it on `createEncounter` (add it to the client `createEncounter` call body + the store action).

- [ ] **Step 2: Store analytics action.** `encounterStore.ts`: `analytics: TraineeAnalytics | null`, `fetchAnalytics(): Promise<void>` calling a new `client.getAnalytics(traineeId)`; add `getAnalytics` to `api/client.ts`.

- [ ] **Step 3: `ProgressPanel.tsx`.** Presentational shadcn card: stat tiles (total encounters, under-triage rate as the headline in destructive color, correct rate) + a compact chronological strip where each past encounter is a colored chip (green=CORRECT, amber=OVER_TRIAGE, red=UNDER_TRIAGE) — visually shows red thinning over time. No charting dep; inline flex chips. Empty state ("complete an encounter to see your progress"). Accessible (chips have text/aria-label, not color alone).

- [ ] **Step 4: Mount in `App.tsx`** on the no-encounter/start screen (so a trainee sees their progress between cases); fetch analytics on mount + after each FEEDBACK. Keep the existing empty-state copy.

- [ ] **Step 5: Tests.** `ProgressPanel.test.tsx`: renders the rates + a chip per history point with correct color/label; under-triage chip carries a distinguishable marker (not color-only). Store test: `fetchAnalytics` sets `analytics` (mock client).

- [ ] **Step 6: Gate (frontend). Commit + push.**
```
git commit -m "feat(web): 'My progress' analytics panel (per-trainee under-triage trend)"
```

---

## Task 4: Streaming / optimistic chat

**Why:** The history chat is the centerpiece and slowest interaction; today `sendHistory` awaits the whole POST while the panel sits frozen with no echo of the trainee's question.

**Files:** `frontend/src/store/encounterStore.ts`, `frontend/src/components/ChatPanel.tsx`, `frontend/src/workflow/History.tsx`, tests.

- [ ] **Step 1: Store.** Add `pendingQuestion: string | null`; set it at the top of `sendHistory(text)` (before the await), clear it in the `run()` wrapper's finally/after the encounter updates. Export it via a selector.
- [ ] **Step 2: ChatPanel.** When `pendingQuestion` is set, render an optimistic trainee bubble (the question) + a "Patient is typing…" indicator bubble after it. History passes `pendingQuestion` as a prop (keep ChatPanel presentational — add an optional `pending?: string | null` prop). Disable the composer while pending (existing `disabled`).
- [ ] **Step 3: Tests.** ChatPanel renders the optimistic bubble + typing indicator when `pending` set; clears when the real turn arrives. Keep existing ChatPanel/History behavior + the 62-test baseline.
- [ ] **Step 4: Gate. Commit + push.** `feat(web): optimistic history chat — instant question echo + 'patient is typing'`

---

## Task 5: Session resume

**Why:** Encounter state is Zustand-memory-only; a refresh/projector hiccup loses everything mid-demo. `getEncounter(id)` exists but nothing calls it.

**Files:** `frontend/src/store/encounterStore.ts`, `frontend/src/App.tsx`, tests.

- [ ] **Step 1: Persist the active encounter id** to localStorage on each successful action (and clear on reset/finish). On store init (or an `init()`/`resume()` action called from App mount), if an id is stored, call `client.getEncounter(id)` via `refresh()` to rehydrate; on 404 clear it.
- [ ] **Step 2: App** calls `resume()` once on mount (before showing the empty state) so a reload restores the encounter.
- [ ] **Step 3: Tests.** Store test: with a stored id, init rehydrates the encounter (mock client returns one); a 404 clears the stored id and shows the empty state.
- [ ] **Step 4: Gate. Commit + push.** `feat(web): session resume — rehydrate the encounter on reload via getEncounter`

---

## Task 6: Accessibility pass

**Why:** A med-ed/clinical-informatics venue expects a credible WCAG story; today async outcomes are invisible to assistive tech (no aria-live, no focus management, chat doesn't auto-scroll).

**Files:** `frontend/src/App.tsx`, `frontend/src/components/ChatPanel.tsx`, `frontend/src/workflow/WorkflowRouter.tsx`, tests.

- [ ] **Step 1: aria-live status region** (visually-hidden, `aria-live="polite"`) in App, fed by store transitions ("Patient replied", "Vitals measured", "Score ready"). Derive from stage/encounter changes; keep it a small effect.
- [ ] **Step 2: Chat auto-scroll + focus.** ChatPanel: a ref at the transcript end + `scrollIntoView` in an effect keyed on `transcript.length`; move focus to the composer after a reply lands. Respect `prefers-reduced-motion` (no smooth-scroll when set).
- [ ] **Step 3: Focus management on stage change** (WorkflowRouter): move focus to the new stage's heading (make headings focusable with `tabIndex={-1}` + ref) so screen-reader users land on the new content.
- [ ] **Step 4: Tests.** App renders an `aria-live` region; ChatPanel scrolls to the newest turn (assert the ref/scroll call via a spy). Keep the baseline green.
- [ ] **Step 5: Gate. Commit + push.** `feat(web): accessibility — aria-live announcements, focus management, chat auto-scroll`

---

## Task 7: Printable / exportable debrief

**Why:** Feedback is the pedagogical payoff but is screen-only and ephemeral; a learner/instructor can't keep a record.

**Files:** `frontend/src/workflow/Feedback.tsx`, `frontend/src/components/ScoreCard.tsx`, `frontend/src/index.css`, tests.

- [ ] **Step 1: Print.** Feedback gets a "Print debrief" button calling `window.print()`; add an `@media print` block in `index.css` that hides the header/nav/buttons and lays the score report out cleanly on white.
- [ ] **Step 2: Export.** An "Export" button serializing the encounter's chiefComplaint + transcript + scoreReport to a downloadable Markdown (or JSON) blob (`Blob` + object URL; no dep). Keep it pure client-side.
- [ ] **Step 3: Tests.** Feedback renders Print + Export buttons; clicking Export triggers a download (spy on URL.createObjectURL / anchor click). Keep ScoreCard tests green.
- [ ] **Step 4: Gate. Commit + push.** `feat(web): printable + exportable debrief from the Feedback stage`

---

## Self-Review

**Coverage vs the two tracks:** (a) real data flow → Task 1; learning-curve metric → Tasks 2+3. (c) streaming chat → 4; session resume → 5; accessibility → 6; printable debrief → 7. All covered.

**Additive-safety:** Tasks 1 & 2 add only OPTIONAL fields with defaults (gradableDimensions=None, traineeId=None) → existing 170 backend / 62 frontend / both contract-parity tests stay green; `_esi_subscore` + synthetic scoring untouched. New analytics types are net-new (no existing shape changed).

**Contract discipline:** `gradableDimensions` is server-side only (TriageCase) → no contract.ts change. `traineeId` + `TraineeAnalytics` DO cross to the client → schema + Pydantic + contract.ts + ajv test, all three.

**Ordering/conflict:** strictly sequential; the store/App/ChatPanel sharing is why. Order de-risks data first (1), establishes the traineeId contract before any store work (2), then view (3), then UX (4–7).

**Identity scope:** per-browser trainee id is NOT auth — it's an opaque analytics key (documented in the schema). No login/security scope creep.

**Risk flags:** Task 1 fetches real data locally (open-access, gitignored, de-id enforced) — not committed; CI stays synthetic. No Docker/network in CI. Each task gated + CI-confirmed before the next.
