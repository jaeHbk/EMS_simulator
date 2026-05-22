# Session handoff — 2026-05-22

Brainstorming-only session. **No code changed.** Output is a single
committed design spec and this handoff. The codebase that existed at
`5a0b41c` is intact.

## What was decided

The user's complaint: the demo "doesn't really achieve anything", the
UI looks bad, the codebase is larger than it needs to be, and there's
no way for Claude Code to check it has reached a milestone correctly.

After scope-decomposing into four sub-projects (A: agent
infrastructure, B: UI overhaul + game, C: codebase audit, D: eval
harness), the user picked **B** as the first cycle and we spent the
session brainstorming it. The other three are deferred to follow-up
cycles.

The spec is committed:

- **`c983f6f`** — `docs: add apnea-game overhaul design spec`
  (1 file, 539 lines).

Path: [`docs/superpowers/specs/2026-05-22-apnea-game-overhaul-design.md`](superpowers/specs/2026-05-22-apnea-game-overhaul-design.md)

### Decisions locked in the spec

- **Goal**: ship a runnable, accurate, game-like EMS demo around one
  scenario (apnea / hypoxic respiratory failure). Aggressive trim of
  the codebase in the same pass.
- **Visual direction**: keep the existing 3D ambulance + patient +
  bedside monitor. Replace the surrounding chrome with a game HUD.
- **Game loop**: stabilize-the-patient. Win = SpO₂ ≥ 95% sustained
  60 s. Lose = SpO₂ < 70% for 30 s, *or* clinical error (NRB on an
  apneic patient ≥ 10 s without concurrent BVM).
- **Architecture**: single Rust binary owns physiology + scenario +
  scoring; frontend is a thin renderer. Wire format adds a `RunFrame`
  multiplexed onto the existing WS.
- **Physiology**: ~250-350 LOC Rust model — replaces
  `TraceReplayEngine`. SpO₂ via PaO₂ → oxyhemoglobin sigmoid; PaO₂
  responds to FiO₂ + minute ventilation. CV stays shallow (HR
  sympathetic, BP held).
- **Scenario engine**: `crates/scenario/` (new). Hardcoded apnea
  scenario for v1; no DSL until there are 2+ scenarios.
- **Camera**: OrbitControls retained (drag/zoom).
- **Codebase trim**: 10 empty crates deleted (`core-ecs`,
  `pharmacology`, `procedures`, `protocols`, `comms`, `world`,
  `vehicles`, `traffic-ai`, `cad-dispatch`, `metrics`),
  `scenario-runtime` renamed to `scenario`. Frontend `ui/instructor/`,
  `ui/scenario/`, `ui/settings/` deleted (audio mute survives in top
  bar). `engine/web/src/styles.css` halves from ~1410 → ~700 lines.
  Legacy session-handoff + UX-refresh docs archived.
- **Milestone-check command**: `just verify` runs fmt + clippy + cargo
  test + tsc + vitest + a new `sim-server replay` subcommand against
  a recorded action-sequence fixture. Exit 0 = milestone reached.
- **Deferrals** (out of scope for this design):
  agent-infrastructure (CLAUDE.md / AGENTS.md / SKILLS.md / `.claude/`),
  multi-scenario eval harness with regression tracking, Pulse FFI,
  server-side run-control RPCs (pause/resume/rate/seek), CC0 GLB
  patient model, mobile/touch.

## What was NOT done

- **Implementation plan** — not written. The brainstorming flow
  completed through "user reviews written spec" (approved). The next
  step is to invoke `superpowers:writing-plans` and produce
  `docs/superpowers/plans/2026-05-22-apnea-game-overhaul.md` —
  task-by-task with exact paths and code blocks. This is the first
  thing the next session should do.
- **Code changes** — none. No crates deleted, no frontend touched, no
  physiology rewritten. Everything in the spec's §13 ("Files touched")
  is a forward-looking promise, not a record.
- **Brainstorm artifact directory** — `.superpowers/brainstorm/` was
  created during the session for the visual-companion server
  (mockups, intro screen, etc.). Added to `.gitignore` in commit
  `c983f6f`. Not committed; safe to delete or keep for reference.

## Pick-up checklist for the next session

1. Read [`docs/superpowers/specs/2026-05-22-apnea-game-overhaul-design.md`](superpowers/specs/2026-05-22-apnea-game-overhaul-design.md)
   end-to-end. Self-contained.
2. Invoke the `superpowers:writing-plans` skill. Output destination:
   `docs/superpowers/plans/2026-05-22-apnea-game-overhaul.md`.
3. The plan should be task-decomposed bite-sized (2-5 minute steps),
   TDD-ordered (write failing test → run → implement → run → commit).
   Suggested task ordering matches §3-§9 of the spec — physiology
   model first (it's the seam everything else depends on), then
   scenario engine, then wire-format additions, then frontend HUD,
   then trim, then `just verify` recipe + `replay` subcommand.
4. After the plan is written and self-reviewed, offer the user the
   two execution modes (subagent-driven vs inline) per the
   writing-plans skill.

## Files of interest (no changes — for context)

- `crates/physiology/src/{lib,trace_replay}.rs` — what we're replacing.
- `crates/sim-server/src/{wire,sim,web,main}.rs` — wire format and
  driver to extend.
- `crates/sim-server/tests/ws_smoke.rs` — extend with action-echo +
  RunFrame assertions when wire format changes.
- `engine/web/src/App.tsx`, `ui/shell/AppShell.tsx` — the slot shell
  the new HUD replaces.
- `engine/web/src/lib/{stream,actions}.ts` — extend for `RunFrame`,
  keep idempotent action posting as-is.
- `engine/web/src/three/Scene.tsx` — keep; reframe camera; keep
  OrbitControls.
- `Cargo.toml` — workspace `members` shrinks to four when crates are
  trimmed.
- `justfile` — add `verify` recipe.

## Branch state

- On `mainline`. One commit ahead of `origin/mainline` (`c983f6f`).
- Working tree clean.
- The session-completion push lands `c983f6f` plus this handoff to
  `origin/mainline`.
