#!/usr/bin/env bash
# Stop the ED Triage Trainer servers + headless Chrome and clean up the demo DB.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

pkill -f "uvicorn app.main:app" 2>/dev/null && echo "backend stopped" || echo "backend not running"
pkill -f "vite" 2>/dev/null && echo "frontend stopped" || echo "frontend not running"
pkill -f "remote-debugging-port=9222" 2>/dev/null && echo "chrome stopped" || echo "chrome not running"

rm -f "$ROOT/backend/ed_triage_demo.sqlite3" 2>/dev/null
rm -rf /tmp/ed_chrome_profile 2>/dev/null
echo "cleaned up demo db + chrome profile"
