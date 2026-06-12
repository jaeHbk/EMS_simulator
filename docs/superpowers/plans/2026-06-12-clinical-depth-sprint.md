# Clinical-Depth Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task = one verified, gated commit + push. Steps use `- [ ]`.

**Goal:** Deepen the tool's clinical fidelity where it most reduces under-triage: (1) score vitals *recognition* (danger-zone values), not just acquisition; (2) add a bank of "calibration-trap" cases (benign-looking but dangerous); (3) tag cases with difficulty so practice can progress and analytics can segment.

**Architecture:** All additive + reusing existing infrastructure. The cited danger-zone thresholds ALREADY live in `app/scoring/esi_algorithm._danger_zone_vitals(vitals, age_band)` — the new vitals scoring REUSES that (no duplicated clinical constants). Trap cases are self-validating: the prior sprint's consistency test asserts every synthetic case's authored `expert.esi == esi_decision(...).level`, so a mislabeled trap fails CI. Difficulty is an optional case field surfaced through to analytics.

**Tech stack:** Python FastAPI/Pydantic/SQLite (backend); React/Vite/TS (frontend, light touch). No new deps.

**Hard rules (AGENTS.md/CLAUDE.md):** contract-first (schema→Pydantic→contract.ts where it crosses); deterministic scoring (LLM never produces a number); **under-triage penalized hardest**; expert labels/hidden history server-side until FEEDBACK; de-id (age bands only); offline-first; reuse the cited ESI v4 thresholds, don't invent new ones.

**Per-task gate (run yourself, read output):** backend `cd backend && . .venv/bin/activate && ruff check . && mypy app && pytest -q`; frontend (if touched) `cd frontend && npm run typecheck && npm run lint && npm run test && npm run build`. Commit (Conventional Commits) + `git push origin main`. Confirm CI green.

**Baseline:** backend 177 tests, frontend 114. Repo clean on `main`.

---

## Task order & conflicts

| # | Task | Touches |
|---|------|---------|
| 1 | Vitals danger-zone recognition scoring | `esi_algorithm.py` (expose helper), `engine.py` `_vitals_dimension`, `test_scoring.py` |
| 2 | `difficulty` case field (contract + analytics segment) | schema, models, `_mimic_format.py`, `synthetic.py`, analytics, contract.ts, tests |
| 3 | Calibration-trap case bank (6 cases) | new `seed/*.json`, `synthetic.py` if templated, tests |

Tasks are independent enough to run in order; 1 and 3 both touch scoring-adjacent areas but different files. Run 1 → 2 → 3. Task 3's trap cases must pass Task 1's new scoring AND the existing consistency test.

---

## Task 1: Vitals danger-zone recognition scoring

**Why:** `_vitals_dimension` only rewards *measuring* a vital (any non-null ground-truth field), not *recognizing* an abnormal one. A trainee who measures SpO₂ 88 scores identically whether or not it's dangerous. Reward recognizing the danger-zone vitals — the exact values that should drive acuity up.

**Files:** `backend/app/scoring/esi_algorithm.py` (expose the danger-zone helper publicly if not already), `backend/app/scoring/engine.py` (`_vitals_dimension`), `backend/tests/test_scoring.py`.

**Design:** Keep the dimension's weight (0.10) and key (VITALS_ACQUISITION) unchanged — but make its sub-score a blend of *acquisition* (did they measure the expected vitals) AND *danger-zone capture* (did the vitals they measured include the case's danger-zone vitals). Reuse `_danger_zone_vitals(vitals_dict, age_band)` from `esi_algorithm` to identify which ground-truth vitals are in the danger zone; the trainee "captures" a danger-zone vital only if they measured that field. This makes the dimension reward *finding the abnormal vital*, which is the clinical skill.

- [ ] **Step 1: Expose the danger-zone helper.** In `esi_algorithm.py`, confirm `_danger_zone_vitals(vitals: dict, age_band: str|None) -> list[str]` exists (it does). Add a thin public wrapper or rename-export so `engine.py` can import it without touching a `_private` name — e.g. add `def danger_zone_vitals(vitals, age_band)` delegating to the existing logic, OR export the existing one. Also add a helper that returns the danger-zone FIELD KEYS (heartRate/respiratoryRate/spo2) not just descriptions, since the engine needs to compare against measured fields. Concretely add:
```python
def danger_zone_fields(vitals: dict[str, float | None], age_band: str | None) -> set[str]:
    """The set of vital FIELD KEYS whose value is in the danger zone (reuses the
    cited thresholds). E.g. {"spo2","heartRate"}. Empty if none/!supplied."""
    # implement by checking the same hr_max/rr_max/_SPO2_MIN against the keys
```
Keep the existing `_danger_zone_vitals` (used by `esi_decision`) intact; the new function shares the thresholds. Add a unit test for `danger_zone_fields` (adult HR 110 → {"heartRate"}; SpO2 90 → {"spo2"}; normal → empty; pediatric boundary).

- [ ] **Step 2: Write failing scoring tests in `test_scoring.py`.** A case with ground-truth vitals where some are danger-zone (e.g. HR 130, RR 24, SpO2 90 with other normals):
  - Trainee measures ALL expected vitals incl. the danger-zone ones → vitals sub-score 1.0 (full acquisition + full danger capture).
  - Trainee measures the non-danger vitals but MISSES the danger-zone ones → sub-score strictly LOWER than a trainee who caught them (this is the new signal: missing a danger-zone vital hurts more than missing a normal one).
  - A case with NO danger-zone vitals → behaves like pure acquisition (back-compat; assert an existing-style expectation).
  - Document the exact blend formula in the test so it's pinned.

- [ ] **Step 3: Implement the blended sub-score in `_vitals_dimension`.** Proposed deterministic blend (document + pin in tests): `expected = non-null ground-truth fields`; `danger = danger_zone_fields(groundTruthVitals, ageBand)`; `measured = trainee's measured fields`. If `expected` empty → 1.0 (unchanged). Else:
  `acquisition = |measured ∩ expected| / |expected|`. If `danger` non-empty: `capture = |measured ∩ danger| / |danger|` and `score = 0.5*acquisition + 0.5*capture` (so missing a danger-zone vital costs more than missing a normal one — half the score rides on catching the dangerous values). If `danger` empty: `score = acquisition` (byte-compatible with today). Update the `detail` string to name which danger-zone vitals were caught/missed (teaching). Keep weight 0.10 + key unchanged.

- [ ] **Step 4: Run backend gate.** All 177 + new pass; the existing vitals tests that used no-danger cases stay green (they hit the `danger empty → acquisition` path). Frontend untouched (run `npm run test` once to confirm 114 — VITALS dimension detail text changed only).

- [ ] **Step 5: Commit + push.**
```
git commit -m "feat(scoring): reward danger-zone vital recognition, not just acquisition

VITALS_ACQUISITION now blends acquisition with danger-zone CAPTURE: half the
sub-score rides on measuring the case's danger-zone vitals (reusing the cited
ESI v4 thresholds in esi_algorithm), so missing an abnormal vital costs more than
missing a normal one. Cases with no danger-zone vitals are byte-compatible with
the old acquisition-only behavior. Weight (0.10) and key unchanged."
```

---

## Task 2: `difficulty` case field (contract + analytics segmentation)

**Why:** A trap case and an obvious anaphylaxis shouldn't be undistinguished. Tagging difficulty lets practice progress (later) and lets the analytics segment under-triage rate by difficulty — the interesting research signal ("trainees under-triage HARD cases at X%").

**Files:** `shared/schemas/triage-case.schema.json`, `backend/app/models/triage_case.py`, `backend/app/data/_mimic_format.py`, `backend/app/data/synthetic.py`, `backend/app/scoring/analytics.py` + `shared/schemas/analytics.schema.json` + `backend/app/models/analytics.py` + `frontend/src/api/contract.ts` (analytics gains an optional difficulty breakdown), tests.

- [ ] **Step 1: Add `difficulty` to TriageCase (SCHEMA FIRST, optional).** In `triage-case.schema.json` top-level properties (NOT required): `"difficulty": { "type": ["string","null"], "enum": ["STANDARD","TRAP",null], "description": "Pedagogical difficulty. TRAP = benign-looking presentation with a dangerous diagnosis (high under-triage risk). null/absent = STANDARD." }`. Mirror `difficulty: str | None = None` in `TriageCase`. Run `pytest tests/test_contract.py` → green (optional). Keep it simple: STANDARD vs TRAP (not a numeric scale) — YAGNI.

- [ ] **Step 2: Set it on sources.** MIMIC cases → leave `None` (unknown). Synthetic seed/generated → leave existing as `None`/STANDARD; Task 3's trap cases set `"difficulty": "TRAP"`.

- [ ] **Step 3: Segment analytics by difficulty.** This crosses to the client, so contract-first: extend `analytics.schema.json` `TraineeAnalytics` with an OPTIONAL `byDifficulty` object: `{ trap: { totalEncounters, underTriageRate }, standard: { totalEncounters, underTriageRate } }` (or a small reusable sub-shape). Mirror in `models/analytics.py` + `contract.ts`. In `compute_analytics`, also bucket the FEEDBACK encounters by their case's difficulty — BUT analytics only sees stored Encounters, which don't carry the case's difficulty. DECISION: the simplest faithful approach is to compute difficulty buckets only if the encounter can resolve its case difficulty. Since `compute_analytics(trainee_id, encounters)` is pure over Encounters, pass it a way to look up difficulty: change the analytics route to also load each encounter's case difficulty (via `data.get_case(enc.caseId).difficulty`, catching unknown-case) and pass a `{caseId: difficulty}` map (or pre-resolved list) into `compute_analytics`. Keep `compute_analytics` pure (inputs only). Unknown/None difficulty → counted in neither bucket (or a "standard" default — document the choice; recommend: None treated as STANDARD).
  - If this materially complicates the pure helper, an acceptable simpler v1: add `difficulty` to the `AnalyticsPoint` (per-encounter, resolved in the route) and let the FRONTEND segment — but prefer server-side `byDifficulty` for a clean API. Implementer: pick the cleaner one and document it.

- [ ] **Step 4: Tests.** `test_api.py`: create encounters across a STANDARD and a TRAP case (force one under-triage on the trap), assert `byDifficulty.trap.underTriageRate` reflects it. `contract-schema.test.ts`: extend the TraineeAnalytics fixture with `byDifficulty`. Backend analytics unit test for the bucketing.

- [ ] **Step 5: Gate both sides. Commit + push.**
```
git commit -m "feat(analytics): difficulty tag on cases + per-difficulty under-triage segmentation

Add optional TriageCase.difficulty (STANDARD|TRAP); analytics now segments the
under-triage rate by difficulty so the headline metric distinguishes trap cases
(benign-looking, dangerous) from standard ones. Additive across schema/model/
contract.ts; difficulty resolved server-side in the analytics route."
```

---

## Task 3: Calibration-trap case bank

**Why:** The current bank is clinically clean but pedagogically easy — obvious sick patients. The highest-value under-triage training is benign-looking-but-dangerous presentations, exactly where real trainees under-triage. Add 6 hand-authored trap cases.

**Files:** new `backend/data/sources/synthetic/seed/*.json` (6), `backend/tests/test_data.py` (assertions), possibly `backend/app/data/synthetic.py` (only if seed loader needs a count bump — check it globs the dir).

**The 6 trap cases (each: reassuring-looking surface, dangerous reality, ESI authored to match `esi_decision`):**
1. **Early sepsis, near-normal vitals** — elderly, "just feels weak/off," low-grade temp, HR mid-90s, but subtle hypotension + a danger-zone RR or SpO₂; expert ESI 2 (high-risk). Red-flag concepts: immunocompromise/recent infection, subtle AMS.
2. **Posterior-circulation stroke as "dizziness"** — vertigo + vomiting + mild ataxia, normal-ish vitals; expert ESI 2 (high-risk, time-critical). Red flags: sudden onset, can't walk, diplopia.
3. **NSTEMI as epigastric discomfort** — older diabetic, "indigestion"/epigastric, no classic chest pain; expert ESI 2. Red flags: diaphoresis, exertional, cardiac risk factors.
4. **Ectopic pregnancy as abdominal pain** — woman of childbearing age, lower abdo pain + spotting, borderline tachycardia; expert ESI 2. Red flag: missed period / positive pregnancy possibility, shoulder-tip pain.
5. **DKA as "fatigue/nausea"** — young, polyuria/thirst, vomiting, tachypnea (danger-zone RR = Kussmaul); expert ESI 2. Red flags: fruity breath, high glucose.
6. **Subarachnoid hemorrhage as "headache"** — "worst headache of life"/thunderclap, normal vitals early; expert ESI 2. Red flags: sudden onset, peaked instantly, neck stiffness.

Each trap case MUST: set `difficulty: "TRAP"`; have `requiresLifeSaving`/`isHighRisk`/`resourcesPredicted` + `groundTruthVitals` + `ageBand` such that `esi_decision(...).level == expert.esi` (the consistency test enforces this — RUN it after authoring each and fix inputs, never the label, never weaken the algorithm); carry `redFlags` + `redFlagConcepts` (anchors+synonyms) so history-taking is scored; be de-identified (age band only); include an `outcome` (real-ish disposition) where it strengthens the lesson; `provenance.license="synthetic-generated"`.

- [ ] **Step 1: Check the seed loader.** Read `synthetic.py` `load_seed_cases()` — confirm it globs `seed/*.json` (so new files load automatically) vs. an explicit list (then update the list). Note any test asserting an exact seed count (e.g. "== 10") and update to the new count.

- [ ] **Step 2: Author the 6 trap JSON files** following the seed shape (copy `sepsis-005.json` as a template). For EACH, after writing, run a quick check that `esi_decision(life_saving=…, high_risk=…, resources_predicted=…, vitals=<groundTruthVitals dict>, age_band=…).level == expert.esi`. Iterate the case's inputs until consistent. (The existing `test_every_synthetic_case_agrees_with_cited_algorithm` will enforce this in the gate.)

- [ ] **Step 3: Tests in `test_data.py`.** Assert: ≥6 cases have `difficulty=="TRAP"`; every TRAP case has redFlags + redFlagConcepts; every TRAP case is de-identified; the seed count test updated. The existing consistency + de-id + every-case-validates tests cover the rest.

- [ ] **Step 4: Backend gate** (the consistency test is the clinical safety net — it MUST pass, proving every trap's authored ESI matches the cited algorithm). Frontend `npm run test` stays 114 (data-only).

- [ ] **Step 5: Commit + push.**
```
git commit -m "feat(data): 6 calibration-trap cases (benign-looking, dangerous)

Add hand-authored high-under-triage-risk cases — early sepsis with near-normal
vitals, posterior-circulation stroke as dizziness, NSTEMI as epigastric pain,
ectopic as abdo pain, DKA as fatigue, SAH as headache — each tagged difficulty=TRAP
with red-flag concepts and an expert ESI validated against the cited ESI v4 algorithm
(the consistency test enforces label correctness). This is where trainees actually
under-triage; the bank now tests it."
```

---

## Self-Review

**Coverage:** vitals-value/danger-zone scoring → Task 1; difficulty tier + analytics segment → Task 2; calibration-trap cases → Task 3. All three chosen items covered.

**Reuse over duplication:** Task 1 reuses `esi_algorithm`'s cited thresholds (no new clinical constants). Task 3 cases are validated by the existing consistency test. Task 2 difficulty is the minimal STANDARD|TRAP enum (YAGNI — no numeric scale).

**Additive-safety:** Tasks 1's no-danger path is byte-compatible; Tasks 2/3 add optional fields/files. Existing 177 backend / 114 frontend stay green. `_esi_subscore` + under>over asymmetry untouched throughout.

**Contract discipline:** `difficulty` on TriageCase is server-side only (no contract.ts) EXCEPT the analytics `byDifficulty` which DOES cross → schema+model+contract.ts+ajv.

**Clinical-safety net:** the consistency test (`expert.esi == esi_decision(...)`) makes trap authoring self-checking — a mislabeled trap fails CI, not the user. This is the key risk control for the most clinically delicate task.

**Ordering:** 1 (scoring) → 2 (difficulty contract) → 3 (cases that exercise both). Each gated + CI-confirmed before the next.
