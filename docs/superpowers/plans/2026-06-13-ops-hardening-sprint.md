# Ops-Hardening Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task = one verified, gated commit + push. Steps use `- [ ]`.

**Goal:** Make the backend safe and observable enough to run for a real cohort / study: fix the SQLite concurrency hazard (single shared connection), add schema migrations, add structured logging + request IDs + LLM cost/latency metrics, and version the API — all additive, no behavior change for existing clients.

**Architecture:** Backend-only, mostly infrastructure. Persistence moves from one process-global connection to a per-operation connection with WAL + busy_timeout + a tiny migration runner, preserving the exact `init_db/save_encounter/get_encounter/list_encounters_by_trainee` public surface so nothing upstream changes. Observability is added via a logging module + a FastAPI middleware (request id + timing) and a thin metrics wrapper around `LLMProvider.complete`. Versioning mounts the existing router under BOTH `/api` (back-compat alias) and `/api/v1` so the frontend (`API_BASE="/api"`) keeps working untouched.

**Tech stack:** Python 3.11 / FastAPI / Pydantic / stdlib sqlite3 + logging. NO new runtime deps (stdlib only). Frontend untouched.

**Hard rules (AGENTS.md/CLAUDE.md):** deterministic scoring (LLM never produces a number — untouched here); offline-first (no key/network → app runs; CI never hits network); contract-first if any wire shape changes (a new `/metrics`/stats response needs schema+model, but keep it backend-only if it doesn't reach the React client — the metrics endpoint is operational, NOT part of the trainee contract, so no contract.ts unless the frontend consumes it; it won't this sprint); secrets only via env (never log API keys).

**Per-task gate (run yourself, read output):** `cd backend && . .venv/bin/activate && ruff check . && mypy app && pytest -q`. If a task touches anything the frontend build covers, also `cd frontend && npm run test`. Commit (Conventional Commits) + `git push origin main`. Confirm CI green.

**Baseline:** backend 196 tests, frontend 118. Repo clean on `main`. Current store uses a module-global `_conn` opened `check_same_thread=False` and committed per write — unsafe under uvicorn worker threads / multiple workers.

---

## Task order & conflicts

| # | Task | Touches |
|---|------|---------|
| 1 | Concurrency-safe persistence: WAL + per-op connection + migrations | `app/store/db.py`, `tests/test_store.py` |
| 2 | Structured logging + request-id middleware + LLM cost/latency metrics | new `app/observability.py`, `app/main.py`, `app/api/routes.py`, `app/llm/provider.py`, `tests/` |
| 3 | API versioning (`/api/v1` + `/api` alias) + operational stats endpoint | `app/main.py`, `app/api/routes.py` or new `app/api/meta.py`, `app/store/db.py` (a count helper), tests |

Run in order. Task 1 reshapes the store (Task 3 adds a tiny count helper to it — sequential). Each gated + CI-confirmed before the next.

---

## Task 1: Concurrency-safe persistence (WAL + per-operation connection + migrations)

**Why:** `app/store/db.py` keeps ONE module-global `sqlite3` connection shared across all request threads (opened `check_same_thread=False`), commits on every write, runs in the default rollback journal, and stores only `(encounter_id, payload)` with no schema version or migration path. Under more than one uvicorn worker thread (or process) this races and can corrupt/lock. Fix: per-operation connections with `PRAGMA journal_mode=WAL` + `busy_timeout`, a `schema_version` table + ordered migration runner, and `created_at`/`updated_at` columns — WITHOUT changing the public function signatures.

**Files:** `backend/app/store/db.py`, `backend/tests/test_store.py`.

**Constraint:** Preserve the EXACT public surface (`init_db(database_url)`, `save_encounter(enc)`, `get_encounter(id)->Encounter` raising KeyError, `list_encounters_by_trainee(id)->list[Encounter]`) and the URL-resolution behavior (`_resolve_path`). The `:memory:` case is special — a per-op connection to a NEW `:memory:` is a fresh empty DB, so `:memory:` MUST keep a single shared connection (document + branch on it). File-backed DBs get a fresh connection per operation.

- [ ] **Step 1: Write failing tests in `test_store.py`** for the new guarantees (keep all existing store tests):
  - Concurrency smoke: spawn N threads (e.g. 20) that each `save_encounter` a distinct encounter against a FILE-backed temp DB (use `tmp_path`), then assert all N are retrievable and none raised. (This would intermittently fail / lock under the old shared-conn-per-write model with WAL absent; with WAL + per-op conn + busy_timeout it passes.)
  - Migration/version: after `init_db`, a `schema_version` (or `user_version`) is set to the current version; calling `init_db` again is idempotent and does not downgrade or error.
  - `created_at`/`updated_at`: saving then re-saving the same encounter updates `updated_at` but preserves `created_at` (store these as ISO strings or epoch; assert created_at stable across an update).
  - `:memory:` still works (existing behavior): init + save + get round-trips in-memory.
  Run them → they fail (columns/threading not yet implemented).

- [ ] **Step 2: Implement the new store.** Design:
  - `init_db(database_url)`: resolve path. For `:memory:` keep ONE persistent shared connection (as today, since a new in-memory conn is empty). For a file path, store the resolved path in the module global and open a short-lived connection ONLY to run migrations, then close it (subsequent ops open their own).
  - `_connect()` helper: open a connection to the resolved path with `PRAGMA journal_mode=WAL` (file DBs), `PRAGMA busy_timeout=5000`, `PRAGMA foreign_keys=ON`. For `:memory:` return the shared connection (do not close it). Provide a context-manager `_operation()` that yields a connection and commits/closes appropriately (no-op close for the shared in-memory conn).
  - Migration runner: an ordered list of migration callables (or SQL statements) keyed by version; `_migrate(conn)` reads `PRAGMA user_version`, applies pending migrations in order inside a transaction, sets `user_version`. Migration 1 = the encounters table WITH `created_at TEXT NOT NULL` + `updated_at TEXT NOT NULL` (plus `trainee_id TEXT` column? optional — keep payload as the source of truth, but a `trainee_id` column would let `list_encounters_by_trainee` use an index instead of a full-table scan; OPTIONAL, only if it stays simple). Keep it minimal and correct.
  - `save_encounter`: open op-conn, upsert with `created_at` set on insert (COALESCE to existing on conflict) and `updated_at` = now. Use UTC ISO strings via the existing `datetime.now(UTC)` pattern.
  - `get_encounter` / `list_encounters_by_trainee`: open op-conn, query, deserialize. Keep the exact ordering + KeyError semantics.
  - mypy strict; ruff clean.

- [ ] **Step 3: Run tests** → all pass (existing + new). The full `pytest -q` must be green (the API tests use `:memory:` via TestClient lifespan — confirm they still pass).

- [ ] **Step 4: Commit + push.**
```
git commit -m "fix(store): concurrency-safe SQLite (WAL + per-operation connection + migrations)

Replace the single process-global connection (shared across request threads,
default journal) with: per-operation connections for file DBs under WAL +
busy_timeout, a user_version-based ordered migration runner, and created_at/
updated_at columns. The :memory: path keeps its required shared connection.
Public surface (init_db/save_encounter/get_encounter/list_encounters_by_trainee)
and semantics unchanged; adds a 20-thread concurrent-write test that the old
shared-connection model could not pass."
```

---

## Task 2: Structured logging + request IDs + LLM cost/latency metrics

**Why:** `grep` confirms there is NO logging, metrics, tracing, or request correlation anywhere — only a bare `/api/health`. You can't debug a failed encounter, measure LLM latency/token spend, or report usage in a paper ("N encounters, median feedback latency, ESI-direction mix"). Add stdlib structured logging, a request-id + timing middleware, and a metrics hook around the LLM provider.

**Files:** new `backend/app/observability.py`, `backend/app/main.py`, `backend/app/api/routes.py`, `backend/app/llm/provider.py`, `backend/tests/test_observability.py` (new) + small assertions in `tests/test_api.py`.

- [ ] **Step 1: `app/observability.py` (new).** Stdlib `logging` only. Provide:
  - `configure_logging(level: str = "INFO")`: sets up a JSON-ish formatter (a `logging.Formatter` emitting `time level logger msg` plus any `extra` fields; keep it dependency-free — a small custom `Formatter` that serializes `record.__dict__` extras to JSON is fine) on the root/app logger. Idempotent.
  - `get_logger(name)`: thin wrapper.
  - A `contextvars.ContextVar[str]` `request_id_var` (default "-") so log records can include the current request id; a small `logging.Filter` that injects `request_id_var.get()` onto each record.
  - An in-process metrics accumulator (module-level, thread-safe via a `threading.Lock`): `record_llm_call(provider: str, latency_s: float, ok: bool, prompt_chars: int, completion_chars: int)` and `snapshot() -> dict` returning counts, total/mean latency, total chars (a stand-in for token/cost — note in a docstring that chars approximate tokens; real token counts would require provider SDK usage). Keep it simple + deterministic to test.

- [ ] **Step 2: Request-id + timing middleware in `main.py`.** Add a `@app.middleware("http")` that: reads an incoming `X-Request-ID` header or generates a `uuid4` hex; sets `request_id_var`; times the request; sets the `X-Request-ID` response header; logs one structured line `method path status duration_ms request_id`. Call `configure_logging(settings.log_level)` in `create_app()` (add `log_level: str = "INFO"` to `app/config.py`). Do NOT log request bodies (could contain trainee free-text / future PII) — log method/path/status/timing only.

- [ ] **Step 3: Metrics around the LLM provider.** In `app/llm/provider.py`, wrap each cloud provider's `complete` (and optionally the local one — but the local stub has ~0 latency, so at minimum the cloud paths) so that on every call it records `record_llm_call(...)` with measured latency, ok/fail, and prompt/completion char counts. Cleanest: do it in the existing `_with_resilience` helper or a thin decorator so all providers are covered uniformly without duplicating timing. Ensure a failure still records (ok=False) before re-raising `LLMUnavailableError`. The `local` provider must not require network — metrics recording is pure in-process, so it's safe to record for local too (decide: record all providers uniformly; simplest + most useful).

- [ ] **Step 4: Tests.** `test_observability.py`: `configure_logging` idempotent; `record_llm_call` + `snapshot` math (2 calls → count 2, mean latency correct, failure counted); the request-id filter injects the contextvar value. In `test_api.py`: assert a response carries an `X-Request-ID` header, and that making an encounter (local provider) increments the LLM metrics snapshot (call `snapshot()` before/after a `/history` POST and assert the count grew). Keep all existing tests green; reset the metrics accumulator between tests (add a `reset_metrics()` for test hygiene).

- [ ] **Step 5: Gate + commit + push.**
```
git commit -m "feat(obs): structured logging, request-id middleware, LLM cost/latency metrics

Add app/observability.py (stdlib logging with a request-id contextvar filter +
a thread-safe in-process LLM metrics accumulator), a request-id + timing HTTP
middleware (X-Request-ID echoed; method/path/status/duration logged — never request
bodies), and uniform per-call LLM latency/ok/char metrics recorded around every
provider.complete (incl. failures). No new deps; offline-safe."
```

---

## Task 3: API versioning (`/api/v1` + `/api` alias) + operational stats endpoint

**Why:** Routes mount under `/api` with no version; a versioned prefix is table stakes for a deployable API and a separately-deployed frontend. And there's no operational visibility endpoint (encounter counts, LLM metrics) for a deploy/poster. Add `/api/v1` WITHOUT breaking the current frontend (which calls `/api/...`), plus a stats endpoint.

**Files:** `backend/app/main.py`, `backend/app/api/routes.py` (or a new `backend/app/api/meta.py` for the stats route), `backend/app/store/db.py` (a `count_encounters()` helper), `backend/tests/test_api.py`.

- [ ] **Step 1: Mount the router under both prefixes.** The router currently is `APIRouter(prefix="/api", ...)`. Change so the SAME route set is reachable at BOTH `/api/...` (back-compat alias — the React client uses `API_BASE="/api"`) and `/api/v1/...`. Cleanest: make the router prefix-less (or `/encounters`-relative) and `app.include_router(api_router, prefix="/api")` AND `app.include_router(api_router, prefix="/api/v1")` in `main.py`. Verify `/api/health` and the new stats route are reachable under both too (or keep health at `/api/health` since it's a liveness probe — document). Ensure no route is double-registered in a way that breaks (FastAPI allows the same router included under two prefixes). The frontend needs NO change (still hits `/api`).

- [ ] **Step 2: `count_encounters() -> int` in `store/db.py`** (op-connection `SELECT COUNT(*)`). Tiny; mirrors the other store helpers; export it.

- [ ] **Step 3: Operational stats endpoint.** Add `GET /api/v1/stats` (and via the alias `/api/stats`) returning a small operational summary: `{ encounters: <count>, llm: <observability.snapshot()> , version: <app version> }`. This is OPERATIONAL, not part of the trainee/React contract — return a plain dict or a small Pydantic `OperationalStats` model defined in the backend only (NO contract.ts, since the React app does not consume it). Document that it's an ops/monitoring surface. Do NOT expose any PII or per-encounter content — counts + aggregate metrics only.

- [ ] **Step 4: Tests (`test_api.py`).** Assert: a representative route works under BOTH `/api/encounters` and `/api/v1/encounters` (create an encounter via each prefix). `GET /api/v1/stats` returns the encounter count + an `llm` snapshot + version, and reflects an increment after creating an encounter. Keep all existing tests green.

- [ ] **Step 5: Gate + commit + push.**
```
git commit -m "feat(api): version routes at /api/v1 (with /api back-compat alias) + ops stats endpoint

Mount the full router under both /api (unchanged for the current frontend) and
/api/v1, so the API has a stable versioned surface without a breaking change. Add
GET /api/v1/stats (encounter count + aggregate LLM metrics + app version) as an
operational/monitoring endpoint (no PII, counts + aggregates only; backend-only,
not part of the React contract). New store.count_encounters() helper."
```

---

## Self-Review

**Coverage vs the chosen track:** WAL + migrations + per-op connection (the concurrency bug) → Task 1; structured logging + request IDs + LLM cost/latency metrics → Task 2; `/api/v1` versioning + stats view → Task 3. All three chosen items covered.

**No-behavior-change discipline:** Task 1 preserves the store's public signatures + `:memory:` handling exactly (only the connection lifecycle changes). Task 3 mounts `/api/v1` ADDITIVELY with `/api` kept as an alias, so the frontend (`API_BASE="/api"`) needs NO change and all 118 frontend tests stay green. Existing 196 backend tests stay green throughout.

**No new deps / offline-first:** stdlib `sqlite3` + `logging` + `contextvars` + `threading` only. The metrics accumulator is pure in-process (no network), so it records for the local provider safely; CI never hits the network.

**No-PII discipline:** the request middleware logs method/path/status/timing only — never request bodies (trainee free-text). The stats endpoint exposes counts + aggregate metrics only, no per-encounter content. Never log API keys.

**Contract discipline:** the stats endpoint is operational and NOT consumed by the React client, so it stays backend-only (no schema/contract.ts). If a future task surfaces stats in the UI, that becomes a contract-first change then.

**Ordering:** 1 (reshape store) → 2 (observability) → 3 (versioning + stats, which adds a store count helper on top of Task 1's store). Each gated + CI-confirmed before the next.

**Risk flags:** Task 1 is the riskiest (touches persistence the whole app depends on) — its concurrent-write test + the existing API/store suite are the safety net; verify the `:memory:` branch explicitly since every API test depends on it. No Docker/multi-worker testing in CI (single-process), so the concurrency win is validated by the threaded test, not a true multi-process run — note this in the commit.
