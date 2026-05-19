# ADR-0002: Phase 0 demo via trace replay + web client

- **Status:** Accepted
- **Date:** 2026-05-19
- **Deciders:** Project lead (impatient for a visible demo)
- **Template:** Michael Nygard, "Documenting Architecture Decisions" (2011)

## Context

ADR-0001 commits the project to Pulse Physiology Engine via FFI and Godot 4
as the 3D client. Phase 0 spike steps 1 and 2 (Pulse local install and the
apnea/NRB reference trace) are complete (see `docs/SESSION_HANDOFF.md`).
The remaining Phase 0 work — live Pulse FFI binding, headless Godot build,
cross-platform determinism — is multi-day work that does not produce a
user-visible artifact until late in the path.

The session goal is to deliver a runnable, polished web demo with high-
quality 3D animation. Two factors push us off the ADR-0001 default:

1. **Web requirement.** ADR-0001 picks Godot 4 as the renderer. Godot 4 has
   a Web export, but quality, bundle size, and integration overhead for a
   stretcher + vitals monitor scene are worse than a dedicated WebGL stack.
2. **Time-to-demo.** A bit-exact Pulse FFI binding + thunk JSON action API
   + runtime-data setup blocks every visible artifact behind multi-day
   work. We already have a *bit-identical* macOS Pulse trace committed as
   `tests/physiology-fixtures/apnea-nrb.macos-arm64.csv`. The trace is the
   ground truth ADR-0001's spike validates against; we can drive the
   simulation core off it with no fidelity loss for the apnea/NRB
   vignette.

## Decision

For the Phase 0 demo, we adopt these temporary deviations from ADR-0001:

1. **Physiology source: deterministic trace replay** of the committed
   Pulse CSV via a new `TraceReplayEngine` implementing the existing
   `PhysiologyEngine` trait. Live Pulse FFI is deferred; it is purely an
   alternate `impl` slotted in behind the same trait.
2. **Renderer: web (React + Vite + react-three-fiber)** instead of Godot
   4. The simulation-core ↔ client seam is unchanged: a streaming vitals
   feed over the network. The seam is engine-agnostic, so a Godot or
   Unity client can subscribe to the same stream later.
3. **Transport: WebSocket with JSON frames.** ADR-0001 names gRPC for
   typed control RPCs and WebSocket for read-only views (steering doc
   §5.1). The Phase 0 demo is read-only vitals streaming, which fits
   WebSocket cleanly and avoids a gRPC-Web gateway. gRPC will be revisited
   when control RPCs (action processing, snapshot/inject) land.

## Consequences

**Positive**

- A runnable, polished web demo lands in this session.
- The `PhysiologyEngine` trait, deterministic clock, and vitals types stay
  authoritative — the trace engine and the live Pulse engine plug into the
  same seam.
- Web client is the most accessible target for instructors, students, and
  reviewers; no install required.

**Negative / debt accepted**

- The demo is constrained to the apnea/NRB scenario for which we have a
  Pulse trace. New scenarios require either a new committed trace or
  the live Pulse engine.
- Godot 4 evaluation from ADR-0001 spike step 4 is not exercised this
  session.

## Acceptance criteria for swapping in live Pulse FFI

ADR-0001 still governs. We swap `TraceReplayEngine` out for
`PulseEngine` when:

1. A `pulse-sys` sub-crate exposes the Pulse C API (`Allocate`,
   `InitializeEngine`, `AdvanceTimeStep`, `PullData`, etc.) with
   `bindgen`-generated `extern "C"` declarations.
2. A `PulseEngine: PhysiologyEngine` impl matches the committed
   `apnea-nrb.macos-arm64.csv` trace within 1e-9 per sample (the
   ADR-0001 determinism criterion).
3. CI builds Pulse against macOS, Linux, and Windows runners.
4. The web client requires no changes (the trait and the wire format are
   the contract).

## Acceptance criteria for swapping in Godot 4 client

The web client is the Phase 0 demo. ADR-0001 will be re-validated against
Godot only if a Phase 1+ requirement (e.g., VR client, in-vehicle haptics)
emerges that the web client cannot meet.

## References

- ADR-0001 §"Spike deliverables (Phase 0)"
- Steering doc §5.1, §9 Phase 0
- `docs/SESSION_HANDOFF.md` (2026-05-15)
- `docs/MILESTONES.md`
