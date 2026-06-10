# ED Triage Trainer

An LLM-driven patient simulator for emergency-department triage training.

> ⚠️ **This is an educational training tool, not a medical device.** It must not be
> used for real clinical decision-making. All patient data is de-identified and
> open-access or synthetic.

## Why

Medical students, nursing staff, and other ED trainees under-triage patients at more
than twice the acceptable rate. Existing tools rely on scripted, non-interactive
scenarios. This simulator gives realistic, conversational practice: the trainee
takes a history from an LLM-driven patient, measures vitals, assigns an **Emergency
Severity Index (ESI) level 1–5**, and orders critical interventions — then gets
immediate, specific feedback scored against expert labels and real outcomes.

## How it works

A single encounter is a strict workflow:

```
CASE_LOAD → HISTORY (chat with LLM patient) → VITALS → ESI (1–5) → INTERVENTIONS → FEEDBACK
```

The backend enforces the workflow and hides expert labels until feedback. Scoring is
deterministic and rule-based (the LLM only writes the narrative), and it **penalizes
under-triage more heavily than over-triage** — the specific safety gap this tool
targets.

## Architecture

Contract-first, language-split: **Python** owns data + clinical logic, **TypeScript**
owns the UI, and they meet only at the JSON-Schema contract in `shared/schemas/`.

```
shared/schemas/   The cross-language contract (TriageCase, Encounter, ScoreReport)
backend/          FastAPI · Pydantic · SQLite — loaders, LLM, state machine, scoring
frontend/         React · Vite · TypeScript · Zustand — the trainee UI
docs/             Design spec + data/ethics docs
```

See `docs/superpowers/specs/2026-06-09-ed-triage-trainer-design.md` for the full
design, and **AGENTS.md** / **CLAUDE.md** for contributor rules.

## Quick start

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload          # http://localhost:8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Runs with **no API key and no network** out of the box: it uses the bundled
open-access demo cases + synthetic generator and a scripted local patient stub. Set
`ANTHROPIC_API_KEY` (and `LLM_PROVIDER=anthropic`) for real LLM-driven patients.

## Data

| Source | Access | Status |
|--------|--------|--------|
| MIMIC-IV-ED **Demo** | Open-access (~100 ED stays) | Bundled, ships now |
| Synthetic generator | None | Bundled, ships now |
| MIMIC-IV-ED **Full** | PhysioNet DUA + CITI training | Loader path; data git-ignored |
| MIETIC | PhysioNet credentialing | Loader path; data git-ignored |

All sources normalize to one `TriageCase`. Credentialed data is never committed.
See `backend/data/sources/*/README.md` for setup and citation requirements.

## License & attribution

Code: open-source (see `LICENSE`). Clinical data retains its PhysioNet license and
must be cited per PhysioNet terms; see the per-source README files.
