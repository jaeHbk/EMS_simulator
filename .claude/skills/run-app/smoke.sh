#!/usr/bin/env bash
# Launch both servers offline, poll ready, drive a full encounter through the live
# HTTP API, and LEAVE THE SERVERS RUNNING for a human to play with.
# Re-runnable: stops any prior instances first. Stop with stop.sh.
set -uo pipefail

# Resolve repo root from this script's location (.claude/skills/run-app/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT" || exit 1

BACKEND_PORT=8000
FRONTEND_PORT=5173
B="http://127.0.0.1:${BACKEND_PORT}/api"

echo "== ED Triage Trainer smoke =="
echo "repo: $ROOT"

# --- stop any prior instances so we don't hit EADDRINUSE ---
pkill -f "uvicorn app.main:app" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# --- preflight: deps present? ---
[ -d backend/.venv ] || { echo "FAIL: backend/.venv missing. Run the first-time install (see SKILL.md)."; exit 1; }
[ -d frontend/node_modules ] || { echo "FAIL: frontend/node_modules missing. Run 'cd frontend && npm install'."; exit 1; }

# --- launch backend (offline, throwaway db) ---
echo "-- starting backend on :${BACKEND_PORT}"
( cd backend && . .venv/bin/activate && \
  LLM_PROVIDER=local ENABLED_SOURCES=synthetic DATABASE_URL="sqlite:///./ed_triage_demo.sqlite3" \
  uvicorn app.main:app --host 127.0.0.1 --port "${BACKEND_PORT}" ) &> /tmp/ed_backend.log &

# --- launch frontend ---
echo "-- starting frontend on :${FRONTEND_PORT}"
( cd frontend && npm run dev ) &> /tmp/ed_frontend.log &

# --- poll readiness (no blind sleeps) ---
ok=0
for _ in $(seq 1 40); do
  curl -sf "${B}/health" >/dev/null 2>&1 && { ok=1; break; }
  sleep 0.5
done
[ "$ok" = 1 ] || { echo "FAIL: backend not ready. Log:"; tail -20 /tmp/ed_backend.log; exit 1; }
echo "   backend ready: $(curl -s "${B}/health")"

ok=0
# Poll via "localhost" (not the 127.0.0.1 literal): Vite's dev server binds IPv6
# (::1) by default, so a 127.0.0.1 probe would miss it and false-report "not ready".
for _ in $(seq 1 40); do
  curl -sf "http://localhost:${FRONTEND_PORT}/" >/dev/null 2>&1 && { ok=1; break; }
  sleep 0.5
done
[ "$ok" = 1 ] || { echo "FAIL: frontend not ready. Log:"; tail -20 /tmp/ed_frontend.log; exit 1; }
echo "   frontend ready (proxy /api -> $(curl -s "http://localhost:${FRONTEND_PORT}/api/health"))"

# --- drive a full encounter through the live API (python, robust JSON) ---
echo "-- driving a full encounter through the live API"
python3 "$SCRIPT_DIR/drive_api.py" "${B}" || { echo "FAIL: API walk failed"; exit 1; }

echo
echo "== SMOKE PASSED. Servers are STILL RUNNING for you to play: =="
echo "   Open  ->  http://localhost:${FRONTEND_PORT}"
echo "   Stop  ->  bash .claude/skills/run-app/stop.sh"
echo "   Logs  ->  /tmp/ed_backend.log  /tmp/ed_frontend.log"
