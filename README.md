# EMS Simulator

A physiologically and operationally accurate 3D Emergency Medical Services
training simulator. The single source of truth for vision, scope, and
architecture is [`/.kiro/steering/ems_simulator_agent_steering_doc.md`](.kiro/steering/ems_simulator_agent_steering_doc.md).

## Status

**Phase 0 — Foundations & spike.** Repository skeleton only. Engine choice
(Godot 4 vs. Unity 6) and physiology integration (Pulse FFI vs. in-house
subset) are deliberately not yet locked. See
[`docs/adr/0001-engine-and-sim-core-stack.md`](docs/adr/0001-engine-and-sim-core-stack.md).

## Layout

See §10 of the steering doc. Top level:

```
crates/   Rust simulation core (deterministic, headless)
engine/   3D / dispatcher / instructor clients (engine project)
data/     Protocols, drugs, procedures, patients, scenarios, maps (YAML)
docs/     ADRs, architecture notes, clinical citations
tools/    Authoring tools
tests/    Golden scenarios and physiology fixtures
```

## Building the simulation core

Requires Rust 1.95+ (edition 2024).

```sh
cargo build --workspace
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

Or, with [`just`](https://github.com/casey/just):

```sh
just build
just test
just check
```

## Non-negotiable principles (excerpt)

1. Clinical fidelity first — physiology is model-driven, not scripted.
2. Protocol-driven — protocols are data, not code.
3. Deterministic — same seed + same inputs produce the same outcome.
4. Headless first — sim core runs without a renderer.
5. Authoring over hard-coding — scenarios, patients, protocols are YAML.
6. Evidence-based — every clinical constant cites a source.

See §1.1 of the steering doc for the full list and §11 for coding standards.

## Contributing

- Conventional Commits, imperative mood, ≤ 50-char subject.
- Every change to the sim core must include or update a golden-scenario or
  physiology fixture test (§12).
- Every clinical entry must include a `sources:` field with citations (§11.3).
- Every cross-module decision needs an ADR in `docs/adr/`.
