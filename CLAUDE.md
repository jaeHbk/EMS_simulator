# EMS Simulator

## Quick start

```bash
# Backend (Rust)
cargo build --release -p sim-server
./target/release/sim-server          # serves on :8080

# Frontend (React/Three.js)
cd engine/web
npm install
npm run dev                          # Vite on :5173 (proxies WS to :8080)

# Or run both at once:
just demo
```

## Architecture

- **Backend**: Rust workspace in `crates/`. `sim-server` is the HTTP+WS server (Axum/Tokio). PhysiologyEngine trait drives vitals.
- **Frontend**: `engine/web/` — React 18 + Three.js (via react-three-fiber) + Zustand. Vite bundler.
- **Wire format**: JSON over WebSocket at 50 Hz. `VitalsFrame` carries all vitals + `run_state` + `interventions`.
- **Data**: `data/` — scenarios, protocols, patients as YAML/JSON.

## Frontend conventions

- **50 Hz rule**: Never let the WS frame feed touch React state. Push to Zustand store; read in `useFrame` / rAF / band-aware selectors.
- **Slot architecture**: `ui/shell/AppShell.tsx` uses named typed slots. New features go in their own slot, not threaded through shell props.
- **Store-first**: `monitorStore` owns ring buffers + latest frame. Components subscribe via selectors keyed on band changes (not every sample).
- **Equipment interactions**: `lib/actions.ts` — ULID-minted optimistic state + server echo reconciliation.
- **Demo mode**: When the backend isn't running, the frontend auto-starts demo mode after 3 WS failures, synthesizing realistic deteriorating-then-recovering vitals so the UI stays alive.

## Key paths

| Concern | Path |
|---------|------|
| App entry | `engine/web/src/App.tsx` |
| Shell layout | `engine/web/src/ui/shell/AppShell.tsx` |
| Monitor (waveforms, tiles) | `engine/web/src/ui/monitor/` |
| 3D scene | `engine/web/src/three/Scene.tsx` |
| Patient model | `engine/web/src/three/Patient.tsx` |
| Equipment system | `engine/web/src/three/equipment/` |
| WS stream + types | `engine/web/src/lib/stream.ts` |
| Action posting | `engine/web/src/lib/actions.ts` |
| Instructor controls | `engine/web/src/ui/instructor/` |
| CSS tokens + layout | `engine/web/src/styles.css` |
| Rust server | `crates/sim-server/src/` |

## Quality bars

- `cargo fmt --check && cargo clippy -D warnings && cargo test --workspace` — all clean
- `tsc -b` (strict + noUncheckedIndexedAccess) — clean
- `vitest run` — 43+ tests pass
- `vite build` — initial JS ~15 KB gz; 3D lazy-loaded
- No `unsafe` outside `pulse-sys` (future); no panics in non-test code
- `prefers-reduced-motion` respected on all animations
- WCAG AA contrast on dark bg; alarm color always paired with shape

## Patterns to follow

- Waveform synths are pure functions of (t, vitals) — no server dependency
- Keyboard shortcuts defined in `lib/useKeyboard.ts`; single letters, no modifiers
- Equipment registry in `three/equipment/registry.ts` — add new items there
- Instructor RPCs fall back to client-side overrides when server 404s
- CSS uses design tokens (`--accent`, `--alarm`, `--abnormal`) — never raw hex in components

## What NOT to do

- Don't add state at 50 Hz to React components — use the store + imperative DOM
- Don't add a second rAF loop — subscribe to `useFrameClock`
- Don't use `--alarm` color for anything except active clinical alarms
- Don't import `three` directly in UI components — keep 3D in `src/three/`
- Don't add npm dependencies without strong justification (bundle size matters)
