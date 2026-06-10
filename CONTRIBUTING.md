# Contributing to ED Triage Trainer

Thanks for your interest! This is an educational triage-training simulator
(**not a medical device**) built on de-identified / synthetic data. Please read
this before opening a PR. The canonical engineering rules live in
[`AGENTS.md`](AGENTS.md); the design is in
[`docs/superpowers/specs/`](docs/superpowers/specs/).

## Prerequisites

- Python 3.11+ (backend), Node ≥18 (frontend; CI runs Node 20)
- No cloud credentials needed — the app runs fully offline by default.

## Dev setup

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload      # http://localhost:8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## Quality bars (CI enforces these on every PR)

Run all of these locally before opening a PR:

```bash
# Backend (from backend/)
ruff check . && mypy app && pytest

# Frontend (from frontend/)
npm run typecheck && npm run lint && npm run test && npm run build
```

A change is "done" only when its side's lint + types + tests all pass.

## Non-negotiable rules (see AGENTS.md for the full list)

- **Contract-first.** Any value crossing the Python↔TypeScript boundary is edited
  in `shared/schemas/*.json` **first**, then the Pydantic model, then
  `frontend/src/api/contract.ts`. Both sides are auto-validated against the schemas;
  keep them in lockstep.
- **Deterministic scoring.** All graded numbers are computed by rule-based code in
  `backend/app/scoring/`. The LLM only authors narrative text — never a score.
- **Under-triage is the headline error** and is penalized more heavily than
  over-triage. Don't flatten ESI scoring to symmetric accuracy.
- **Server-side secrets.** Expert labels and hidden history never reach the client
  before `stage == FEEDBACK`.
- **De-identification is enforced in code.** Never commit credentialed MIMIC/MIETIC
  data, exact ages, dates, or identifiers. Age **bands** only.
- **Offline-first.** With no API key and no network the app must still run; CI never
  hits the network.

## Commits & PRs

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
  `docs:`, `test:`, `ci:`, `chore:`, area-scoped where useful (`feat(scoring): …`).
- One logical change per PR. Describe the problem you solved and how you verified it.
- Include the gate output (tests passing) in the PR description.
