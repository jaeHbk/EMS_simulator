export const meta = {
  name: 'ed-triage-improvements',
  description: 'Analyze the ED Triage Trainer across 5 dimensions (grounded in the real code) and propose prioritized improvements',
  phases: [{ title: 'Analyze', detail: '5 dimension experts read the codebase and each return scored improvement proposals' }],
}

const REPO = '/Users/jaehunb/Documents/EMS_simulator'

const COMMON = `
You are evaluating the ED Triage Trainer — a deployable web app for emergency-department
triage training. A trainee works a 6-stage workflow (CASE_LOAD → HISTORY [chat with an
LLM patient] → VITALS → ESI 1-5 → INTERVENTIONS → FEEDBACK); deterministic scoring grades
against expert labels + real outcomes, emphasizing under-triage as the dangerous error.
Stack: Python FastAPI backend (data/llm/sim/scoring/store/api modules), React/Vite/Zustand
+ shadcn/ui frontend. Grounded in de-identified MIMIC-IV-ED / MIETIC + a synthetic generator.
The stated goal (per the project brief) is a conference-presentable tool suitable for a
medical-education or clinical-informatics venue.

Repo root: ${REPO}. cd there. READ the real code before proposing anything — your job is to
find improvements that genuinely move this toward a great, publishable, deployable product,
NOT to restate what already exists. For each proposal, first confirm the current state by
reading the relevant files, and explicitly note what's already there so you don't propose it.

Read at least: ${REPO}/README.md, ${REPO}/AGENTS.md, ${REPO}/CLAUDE.md,
${REPO}/docs/superpowers/specs/2026-06-09-ed-triage-trainer-design.md, and the files in your
dimension. Use grep/find/Read freely. Do NOT edit any files, run git, or start servers.

Propose 3-7 high-value improvements for YOUR dimension. Be specific and grounded (cite real
files/paths/functions). Each must have a concrete first step a developer could start today.
Score impact and effort honestly. Prefer fewer, sharper proposals over a long shallow list.
`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'currentState', 'proposals'],
  properties: {
    dimension: { type: 'string' },
    currentState: { type: 'string', description: 'brief, grounded summary of what already exists in this dimension (so nothing already-done is proposed)' },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'impact', 'effort', 'firstStep', 'files'],
        properties: {
          title: { type: 'string' },
          why: { type: 'string', description: 'why it matters for a publishable/deployable triage trainer; the user value' },
          impact: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          effort: { type: 'string', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
          firstStep: { type: 'string', description: 'concrete first action, grounded in the real code' },
          files: { type: 'array', items: { type: 'string' }, description: 'real files/dirs this touches' },
        },
      },
    },
  },
}

phase('Analyze')

const clinical = `${COMMON}
DIMENSION: CLINICAL & EDUCATIONAL FIDELITY. Read backend/app/scoring/engine.py,
backend/app/data/synthetic.py + the seed cases, backend/app/llm/patient.py + prompts,
backend/data/sources/. Evaluate: are the ESI rules + scoring pedagogically sound and defensible
to ED educators? Is red-flag detection (substring/token matching) robust enough, or gameable?
Is the patient persona realistic + safe (no leaking the diagnosis/ESI)? Case diversity + acuity
mix? What would make the *learning* better (debrief depth, rationale, references, repeated-practice
analytics, difficulty progression, ESI tie-breakers, mistriage teaching)? What would a reviewer at
a med-ed/clinical-informatics venue criticize about clinical validity?`

const data = `${COMMON}
DIMENSION: DATA & RESEARCH-READINESS. Read backend/app/data/ (registry, mimic_demo, mimic_full,
mietic, _mimic_format, synthetic), backend/data/sources/*/README, the design doc's data section.
The brief promises grounding in REAL MIMIC-IV-ED / MIETIC data + real patient outcomes, but today
only the open demo subset + synthetic cases ship and the credentialed loaders are stubs. Evaluate:
the path to actually ingesting real MIMIC-IV-ED (volume, outcome linkage, de-id verification, the
DUA workflow), whether 'real outcome alignment' is meaningfully realized, dataset breadth/balance,
reproducibility + provenance for a paper, and what evidence/metrics a publication would need
(e.g. validation of expert ESI labels, inter-rater data, study/eval design for the tool itself).`

const backend = `${COMMON}
DIMENSION: BACKEND ARCHITECTURE & ROBUSTNESS. Read backend/app/main.py, app/api/routes.py,
app/store/db.py, app/sim/machine.py, app/llm/provider.py, app/config.py. Evaluate: persistence
(SQLite/JSON blob — durability, migrations, concurrency, multi-instance), encounter lifecycle +
data model limits, LLM provider robustness (timeouts, retries, streaming, cost, prompt-injection
hardening, error surfaces), observability (logging/metrics/tracing), API design (versioning,
pagination, idempotency), and anything that blocks running this for many concurrent trainees or
deploying it reliably. Note what's already solid (offline-first, thin routes, deterministic scoring).`

const frontend = `${COMMON}
DIMENSION: FRONTEND UX & ACCESSIBILITY. Read frontend/src/App.tsx, workflow/*, components/*,
store/encounterStore.ts, the shadcn setup. The UI was just restyled with shadcn (two-pane clinical
workspace, light/dark). Evaluate remaining UX gaps: loading/streaming feedback during LLM calls,
error recovery + retries, keyboard/screen-reader accessibility (WCAG, focus management, the chat +
ESI radios + vitals), responsive/mobile + tablet (likely the real device for floor training),
empty/edge states, the history chat affordances (suggested questions, partial-credit cues),
session resume, and whether an instructor/review mode or printable debrief would add value.
What would make a conference demo feel polished and a real trainee experience smooth?`

const ops = `${COMMON}
DIMENSION: TESTING, SECURITY/PRIVACY, DEPLOYMENT & OPS. Read backend/tests/, frontend tests,
.gitignore, README quick-start, any CI config (or note its absence), .env.example, the data
provenance/de-id rules in AGENTS.md. Evaluate: test-coverage gaps (LLM cloud paths, API edge cases,
e2e, frontend interaction coverage, accessibility tests), CI/CD (is there any? lint+type+test gates,
preventing the green-tests-hide-real-bugs pattern seen earlier), deployment story (containerization,
hosting, env/secrets management, the offline demo vs cloud-LLM split), security/privacy (auth/rate
limiting/CORS, prompt-injection, credentialed-data handling, secret management), and licensing/
attribution for the data + a contributor-ready repo (LICENSE, CONTRIBUTING, issue templates).`

const dims = await parallel([
  () => agent(clinical, { label: 'analyze:clinical-fidelity', phase: 'Analyze', schema: SCHEMA }),
  () => agent(data,     { label: 'analyze:data-research',     phase: 'Analyze', schema: SCHEMA }),
  () => agent(backend,  { label: 'analyze:backend-arch',      phase: 'Analyze', schema: SCHEMA }),
  () => agent(frontend, { label: 'analyze:frontend-ux',       phase: 'Analyze', schema: SCHEMA }),
  () => agent(ops,      { label: 'analyze:test-sec-deploy',   phase: 'Analyze', schema: SCHEMA }),
])

const results = dims.filter(Boolean)
return {
  dimensions: results,
  totalProposals: results.reduce((n, d) => n + d.proposals.length, 0),
  highImpact: results.flatMap((d) =>
    d.proposals.filter((p) => p.impact === 'HIGH').map((p) => ({ dimension: d.dimension, ...p })),
  ),
}
