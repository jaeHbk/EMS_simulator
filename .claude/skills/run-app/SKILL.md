---
name: run-app
description: Launch and drive the ED Triage Trainer (FastAPI backend + React/Vite frontend) to verify it works end to end. Use when asked to run, start, demo, or screenshot the app, or confirm a change works in the real app rather than only in tests.
---

# Run the ED Triage Trainer

Two processes: a **FastAPI backend** (`:8000`) and a **Vite dev server** (`:5173`)
that proxies `/api` to the backend. The app runs fully offline — no API key, no
network — using the bundled synthetic cases and a scripted local patient.

Repo root assumed: `/Users/jaehunb/Documents/EMS_simulator` (adjust if relocated).
Prereqs are already installed from earlier sessions; the smoke script reuses them.

## Quick start (one command)

```bash
bash .claude/skills/run-app/smoke.sh
```

It starts both servers, polls them ready, drives a full encounter through the live
HTTP API (create → history → vitals → ESI → interventions → feedback), asserts the
under-triage safety signal + no expert-label leak, and **leaves both servers
running** so a human can open http://localhost:5173 and play. Re-running it stops
any prior instances first. Stop everything with:

```bash
bash .claude/skills/run-app/stop.sh
```

## First time only — install deps

```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]" && cd ..
cd frontend && npm install && cd ..
```

## Run (manual, if you want the steps)

Backend — background, offline provider, throwaway DB:

```bash
cd backend && . .venv/bin/activate
LLM_PROVIDER=local ENABLED_SOURCES=synthetic DATABASE_URL="sqlite:///./ed_triage_demo.sqlite3" \
  uvicorn app.main:app --host 127.0.0.1 --port 8000 &> /tmp/ed_backend.log &
# ready when:  curl -sf http://127.0.0.1:8000/api/health  -> {"status":"ok"}
```

Frontend — background; it proxies `/api` to :8000:

```bash
cd frontend && npm run dev &> /tmp/ed_frontend.log &
# ready when:  curl -sf http://127.0.0.1:5173/  -> HTTP 200
#   and proxy: curl -sf http://127.0.0.1:5173/api/health -> {"status":"ok"}
```

Open **http://localhost:5173** in a browser. Click **Start encounter** and work the
6 stages: Case → History (chat with the AI patient) → Vitals → ESI (1–5) →
Interventions → Feedback.

### Environment

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `local` | `local` = scripted offline patient (no key). `anthropic`/`openai` need a key. |
| `ENABLED_SOURCES` | `mimic_demo,synthetic` | smoke uses `synthetic` (always present). |
| `DATABASE_URL` | `sqlite:///./ed_triage.sqlite3` | smoke uses a throwaway `*_demo` db it deletes on stop. |

## Drive the UI in a headless browser (agent)

There is **no `chromium-cli`** here. Drive system Chrome via the DevTools Protocol.
Two gotchas this repo hit, both handled by `browser-drive.mjs`:
- Node 18 has **no global `WebSocket`** → the driver imports `ws` from
  `frontend/node_modules/ws/wrapper.mjs` (present transitively via vite).
- Under any DOM env the global `URL` can shadow Node's → the driver resolves paths
  from `process.cwd()`, not `import.meta.url`.

```bash
# servers must already be up (smoke.sh leaves them running)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=1280,900 \
  --remote-debugging-port=9222 --user-data-dir=/tmp/ed_chrome_profile about:blank \
  &> /tmp/ed_chrome.log &
sleep 3
node .claude/skills/run-app/browser-drive.mjs   # navigates, clicks Start, screenshots
# screenshot -> /tmp/ed_app_caseload.png  (Read it; a blank frame = launch failure)
```

A plain render-only screenshot (no interaction) is also fine for a quick check:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=4000 --window-size=1280,900 \
  --screenshot=/tmp/ed_app.png http://127.0.0.1:5173/
```

## What "working" looks like

- `/api/health` → `{"status":"ok"}`; `:5173/api/health` proxies through to the same.
- A created encounter response carries **no** `esiRationale` / `criticalInterventions`
  (expert labels stay server-side until FEEDBACK).
- Feedback on a deliberate under-triage (e.g. assign ESI 4 to an ESI-2 case) returns
  `triageDirection: "UNDER_TRIAGE"`, a low `overallPercent`, and a "Safety alert"
  narrative. Scoring dimension weights sum to 1.0.
- Illegal stage jumps (e.g. advance back to `CASE_LOAD`) return HTTP 409.
- UI renders the "Educational training tool — not a medical device" disclaimer and
  the 6-step workflow indicator.

## Gotchas

- **Ports busy** → a prior run is still up. `bash .claude/skills/run-app/stop.sh`.
- **Vite first paint is slow** the first time it compiles — poll the port, don't `sleep`.
- **Don't commit the demo DB**: `backend/ed_triage_demo.sqlite3` is gitignored
  (`*.sqlite3`); `stop.sh` deletes it anyway.
- Logs: backend `/tmp/ed_backend.log`, frontend `/tmp/ed_frontend.log`, chrome
  `/tmp/ed_chrome.log`.
