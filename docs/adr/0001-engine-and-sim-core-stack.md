# ADR-0001: Engine and simulation-core stack

- **Status:** Proposed (criteria captured; decision deferred to Phase 0 close)
- **Date:** 2026-05-15
- **Deciders:** Project leads + clinical advisor + tech lead
- **Template:** Michael Nygard, "Documenting Architecture Decisions" (2011)

## Context

The EMS simulator must satisfy six non-negotiable principles (steering doc
§1.1): clinical fidelity, protocol-driven behavior, determinism, separation
of simulation from presentation, authoring-over-hard-coding, and
evidence-based content.

These principles together require us to choose:

1. The **simulation-core language** for the deterministic, headless tick
   loop (physiology, protocols, CAD, scenarios).
2. The **physiology backend** that drives cardiovascular, respiratory,
   neurological, metabolic, and pharmacology subsystems.
3. The **3D engine** that renders the world and runs the player-facing
   client(s).
4. The **transport** between the sim core and the engine clients.

Phase 0 (steering doc §9) explicitly leaves these open until prototyping
validates the integration; this ADR captures the criteria that the spike
work must answer, so the decision is rigorous rather than vibes-based.

## Decision drivers

In priority order, mirroring the agent priority list (steering doc §11.1):

1. **Clinical correctness.** Can the physiology backend reproduce textbook
   vitals trajectories for our Phase 1 vignettes (chest pain, apnea,
   anaphylaxis, hypoglycemia)? Is its parameterization auditable?
2. **Determinism.** Does the full stack produce bit-identical output across
   macOS, Windows, and Linux given the same seed?
3. **Operational realism.** Can the engine render the patient compartment
   interior and 1–10 km² scenario maps at 60 FPS / 1080p on a mid-range GPU
   while the sim core runs ≤ 5 ms/tick?
4. **Performance.** No GC stalls in the sim core; sim → render latency
   ≤ 50 ms.
5. **Visual polish.** Animation tooling, particle/lighting quality. Lowest
   priority — never trades against the above.

Other drivers:

- **Licensing for academic and commercial distribution.** OSI-approved,
  redistributable, no per-seat fee on student deployments.
- **Long-term maintainability.** Active upstream, healthy community, stable
  ABI (where FFI is involved).
- **Team familiarity / onboarding cost.**

## Options under evaluation

### Simulation-core language

| Option | Pros | Cons |
|---|---|---|
| **Rust (proposed default)** | Strong determinism, no GC jitter, exhaustive matching, mature FFI. | Steeper learning curve; slower compile times. |
| C++ | Native fit with Pulse; broadest physics/sim ecosystem. | Memory-safety burden; harder to enforce determinism. |
| C# | Same language as Unity client; large ecosystem. | GC introduces jitter unpredictability; locks us toward Unity. |

Tentative choice: **Rust**, pending Pulse FFI spike.

### Physiology backend

| Option | Pros | Cons |
|---|---|---|
| **Pulse Physiology Engine (Apache 2.0, C++)** | Validated cardio/resp/PK-PD; published validation reports; active upstream (Kitware). | C++ FFI surface; build-system complexity; subset of conditions out-of-the-box. |
| In-house Rust subset | Total control of data flow and determinism; no FFI. | Years of clinical validation work to redo; heavy dependency on SME hours. |
| BioGears (deprecated upstream of Pulse) | Same lineage as Pulse. | No longer actively maintained. |

Tentative choice: **Pulse via FFI**, with a thin Rust wrapper crate
(`physiology`). Fall back to an in-house subset only if the spike (§Phase 0
deliverable) shows cross-platform FFI is impractical.

### 3D engine

| Option | Pros | Cons |
|---|---|---|
| **Godot 4 (MIT)** | Permissive license; first-class headless mode; small footprint; GDScript + C# + GDExtension (C/C++/Rust). | Smaller asset ecosystem than Unity; some animation tooling gaps. |
| Unity 6 | Largest asset ecosystem; mature animation tooling; strong rendering pipeline. | License terms have changed historically; per-seat cost concerns; less first-class headless story. |
| Unreal 5 | Best-in-class rendering. | Heavyweight; C++ build complexity; royalty for commercial. |

Tentative choice: **Godot 4 with C#/Rust hot paths via GDExtension**. The
license freedom, headless ease, and small footprint align with Phase 5
accreditation distribution.

### Transport (sim ↔ clients)

| Option | Pros | Cons |
|---|---|---|
| **gRPC (HTTP/2) + bidi streaming** | Strong typing via protobuf; cross-language clients; battle-tested. | TCP head-of-line blocking; ≥ ~1 ms overhead per RPC. |
| Custom UDP frames | Lowest latency; full control. | Reliability/ordering must be hand-rolled; harder to debug. |
| WebSocket + JSON | Trivial browser client for instructor console. | Higher CPU per message; no schema enforcement. |

Tentative choice: **gRPC for control / state queries; WebSocket for the
read-only debrief viewer**. Revisit if Phase 4 multiplayer or in-vehicle
haptics surfaces a latency floor we can't meet.

## Spike deliverables (Phase 0)

A concrete go/no-go on this ADR requires:

1. A Rust crate that links Pulse and runs the "apnea + 100% O2 via NRB"
   vignette deterministically on macOS, Windows, and Linux. Output: SpO2
   and ETCO2 traces as CSV; cross-platform diff ≤ 1e-9 per sample.
2. A headless Godot 4 build (and a parallel Unity 6 build for comparison)
   that connects to the Rust sim over gRPC and renders one patient on a
   stretcher with vitals overlay updated at the 50 Hz tick rate.
3. A `cargo test` and engine-side integration test that together produce a
   reproducible bit-identical run log given a fixed seed.

## Consequences

**If the tentative stack holds:**

- We commit to Rust + Pulse + Godot 4 + gRPC for the v1 codebase.
- The team needs to invest in Rust onboarding and Pulse parameter literacy
  for any contributor working on physiology.
- The 3D client team works in C# / GDScript / GDExtension instead of
  Unity-specific tooling; we lose access to Unity Asset Store packs.

**If Pulse FFI spike fails or licensing becomes incompatible:**

- Fall back to an in-house Rust physiology subset scoped to Phase 1's
  required vignettes. This adds an estimated 3–6 months of clinical-SME
  hours for parameter sourcing and validation.

**If Godot 4 spike fails:**

- Re-evaluate Unity 6 with the assumption that we accept GC jitter only on
  the *render* side (sim core stays in Rust).

## Status of the open questions (steering doc §13)

This ADR addresses the engine, physiology backend, and transport choices
listed in §13. It does **not** address: map data licensing (separate ADR),
voice/TTS choice (separate ADR), or multiplayer transport beyond Phase 4
(revisit at Phase 3 close).

## References

- Steering doc, §1.1, §3.1, §5, §9, §11.1
- Pulse Physiology Engine — <https://pulse.kitware.com/>
- Godot Engine — <https://godotengine.org/>
- Unity — <https://unity.com/>
- M. Nygard, "Documenting Architecture Decisions" (2011)
