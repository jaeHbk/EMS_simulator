<!--
  EMS Simulator — Agent Steering Document
  Inclusion: always (default)
  Audience: Kiro agent + human contributors
  Purpose: Single source of truth for the vision, architecture, and implementation
           plan of the most accurate 3D Emergency Medical Services simulator.
-->

# EMS Simulator — Master Plan & Steering Doc

## 1. Vision

Build the most physiologically and operationally accurate **3D Emergency Medical
Services (EMS)** simulator available. The product trains EMTs, paramedics,
dispatchers, and incident commanders by reproducing the full chain of
emergency response — from 911 call intake, through dispatch and response
driving, on-scene assessment and treatment, transport, hospital handoff, and
post-incident documentation — at a level of fidelity suitable for accredited
training and academic research.

### 1.1 Non-negotiable principles

1. **Clinical fidelity first.** Patient physiology must be driven by validated
   models (cardiovascular, respiratory, pharmacokinetic/pharmacodynamic), not
   scripted state machines. If a treatment would change a real patient's vitals,
   it must change the simulated patient's vitals via the model.
2. **Protocol-driven, not hard-coded.** Treatment protocols (NREMT, regional
   medical-director protocols, AHA ACLS/PALS, ITLS/PHTLS) are loaded as data,
   not baked into engine code. Switching jurisdictions must not require a
   rebuild.
3. **Deterministic and reproducible.** Same seed + same inputs produce the same
   outcome. Required for debriefing, grading, and regression testing.
4. **Separation of simulation and presentation.** The headless simulation core
   must run without any 3D renderer. The 3D client is a view onto the sim.
5. **Authoring over hard-coding.** Scenarios, patients, environments, and
   protocols are all data files (YAML/JSON) under version control.
6. **Evidence-based.** Every physiological constant, drug parameter, and
   protocol step cites a source in the data file's metadata.

### 1.2 Out of scope (initially)

- Full open-world city traversal (we use bounded scenario maps).
- VR/AR clients in v1 (architecture must allow them later).
- Hospital-side ED simulation beyond patient handoff.
- Billing, ePCR submission to real systems, and HIPAA-regulated data flows.

---

## 2. Domain Scope

The simulator covers, end-to-end, the following EMS workflow phases. Each phase
is a first-class module with its own data, UI, and metrics.

| Phase | Description | Key actors |
|---|---|---|
| Call intake | 911/PSAP call, EMD card-based interrogation (e.g., MPDS-style) | Caller (NPC), Dispatcher (player or AI) |
| Dispatch & routing | Unit selection, routing, mutual aid, multi-unit response | CAD, Dispatcher |
| Response driving | Emergency vehicle operation, lights/siren, traffic, weather | Driver (player), Traffic AI |
| Scene size-up | Scene safety, MOI/NOI, BSI, resource needs, triage (START/JumpSTART) | Crew lead |
| Patient assessment | Primary (XABCDE), secondary, SAMPLE, OPQRST, vitals | EMT/Paramedic |
| Treatment | BLS/ALS interventions per protocol; pharmacology; airway; trauma | EMT/Paramedic |
| Transport | Mode/destination selection, en-route monitoring and reassessment | Crew |
| Handoff | Hospital report (MIST/SBAR), patient transfer | Crew, ED staff (NPC) |
| Documentation | ePCR completion, narrative quality, billing-relevant fields | Crew |
| Debrief | Replay, metrics, instructor feedback | Instructor, trainee |

Mass-casualty incidents (MCI), hazmat staging, technical rescue interfaces,
and pediatric/geriatric/obstetric specialty calls are explicitly in scope and
must work from day one of the relevant phase.

---

## 3. Clinical & Physiological Fidelity

This is the differentiator. Other "EMS sims" use scripted vitals; we will not.

### 3.1 Patient model (the "digital twin")

Each patient is a composite of subsystem models updated every simulation tick:

- **Cardiovascular**: lumped-parameter model with preload, afterload,
  contractility, SVR, HR. Outputs: BP (systolic/diastolic/MAP), HR, ECG
  morphology, peripheral perfusion, capillary refill.
- **Respiratory**: compartment model for tidal volume, RR, FiO2, SpO2, ETCO2,
  PaO2/PaCO2, work of breathing, airway patency.
- **Neurological**: GCS components (E/V/M), pupil response, ICP proxy, focal
  deficits, seizure activity.
- **Metabolic / fluid**: blood volume, hematocrit, glucose, electrolytes (Na, K,
  Ca), pH, lactate, temperature.
- **Trauma overlay**: per-region injury (head, neck, chest, abdomen, pelvis, 4
  extremities) with bleeding rate, fracture, open/closed, neurovascular status.
- **Pharmacology**: PK/PD per administered drug. Each drug has Vd, clearance,
  half-life, onset, and effect functions on the subsystems above.
- **Comorbidities & history**: SAMPLE history influences baseline parameters
  and response to interventions.

Reference frameworks to align with (study and adapt, do not copy code without
license review): BioGears / Pulse Physiology Engine (Apache 2.0) for the
physiology core; we will either integrate Pulse via its C++ API or implement a
compatible subset in our chosen engine language.

### 3.2 Treatment effects

Every intervention is modeled as an input to the physiology engine, not a
direct vitals nudge. Examples:

- **Oxygen via NRB at 15 L/min** → increases FiO2 → respiratory model raises
  SpO2 over a realistic time course based on shunt fraction.
- **Epinephrine 1 mg IV** → PK bolus → PD effect on HR, contractility, SVR,
  bronchodilation, with realistic onset and duration.
- **Tourniquet** → sets bleeding rate to ~0 distal to placement, but introduces
  ischemia clock for that limb.
- **Endotracheal intubation** → resolves airway obstruction iff procedure is
  performed correctly (tube depth, cuff inflation, confirmation by ETCO2 and
  bilateral breath sounds); otherwise risks esophageal placement, bronchial
  intubation, or dental trauma.

Procedures are themselves simulated as multi-step tasks with success
probabilities modulated by skill, environment (lighting, vehicle motion,
patient anatomy, blood/vomit in airway), and equipment state.

### 3.3 Protocol engine

Protocols are authored in a declarative DSL (YAML) and interpreted at runtime.
Example protocol node shape:

```yaml
id: chest-pain-adult
applies_when:
  age_years: ">= 18"
  chief_complaint: ["chest pain", "chest pressure"]
steps:
  - assess: [vitals, 12_lead_ecg, sample_history]
  - if: { ecg.stemi: true }
    then: [activate_cath_lab, transport_priority_1, asa_324mg_po, ntg_sl]
  - reassess_every_minutes: 5
sources:
  - "AHA 2020 ACLS Guidelines, Part 9"
  - "Regional Protocol v2024.3, Cardiac §4.2"
```

The engine evaluates protocols against the live patient state and provides
**guidance**, **grading**, and **deviation logs** for debrief. It never forces
the player's hand; trainees can deviate and the model will respond accordingly.

---

## 4. 3D World & Environment

### 4.1 Map & terrain

- Bounded scenario maps (1–10 km²) authored in a tile/heightmap format with
  semantic layers (roads, buildings, water, vegetation, addresses).
- Real-world geometry imported from OpenStreetMap + USGS DEM where licensing
  permits; otherwise authored.
- Address-level granularity: every building has a unique address resolvable by
  CAD. Interior generation for buildings entered during scenarios.

### 4.2 Vehicles

- Type 1/2/3 ambulances, rescue, engine, supervisor SUV, helicopter (HEMS).
- Realistic vehicle dynamics (mass, suspension, tire grip) sufficient for
  emergency-driving training: weight transfer, understeer/oversteer,
  intersection clearing, lane changes with lights/siren.
- Patient compartment is a fully interactive interior: stretcher, bench,
  captain's chair, monitor/defib mount, drug box, O2, suction, intubation kit.

### 4.3 NPCs & traffic

- Traffic AI with intersection logic, yielding to lights/siren (variable and
  imperfect), pedestrian behavior, bystander crowds at scenes.
- Crowd model for MCIs.
- Patient and bystander animation/voice driven by state (LOC, pain, distress).

### 4.4 Weather, time, lighting

- Time-of-day affects lighting, traffic density, and call profile.
- Weather (rain, snow, fog, heat) affects vehicle handling, scene safety,
  patient physiology (hypothermia/hyperthermia), and equipment (fogged
  laryngoscope, wet defib pads).

---

## 5. Technical Architecture

### 5.1 High-level layering

```
+------------------------------------------------------+
|  Clients: 3D Game Client | Dispatch Console | Web    |
|           Instructor Console | Debrief Viewer        |
+------------------------------------------------------+
|  Transport: gRPC + WebSocket (sim events)            |
+------------------------------------------------------+
|  Simulation Core (headless, deterministic)           |
|   - World/ECS  - Physiology  - Protocols  - CAD      |
|   - Vehicle dynamics - AI - Scenario runtime         |
+------------------------------------------------------+
|  Data: Scenario/Protocol/Patient YAML, SQLite logs   |
+------------------------------------------------------+
```

The **simulation core is headless and authoritative**. The 3D client is a
view + input device. This enables: instructor-only mode, multiplayer crews,
automated regression testing, and post-hoc replay rendering.

### 5.2 Tick model

- Fixed-step simulation tick at **50 Hz (20 ms)** for physics and physiology.
- Render at the client's display rate, interpolating between sim states.
- All randomness is drawn from a single seeded PRNG with named sub-streams
  (one per subsystem) to preserve determinism while allowing isolated changes.

### 5.3 ECS

Entity-Component-System architecture. Components are pure data; systems are
pure functions over component sets. This keeps the physiology, AI, and
rendering decoupled and testable.

### 5.4 Tech stack (proposed; revisit at Phase 0 close)

- **Engine / 3D**: **Godot 4** (GDScript + C# for hot paths) or **Unity 6**
  (C#). Decision criteria: licensing for academic distribution, ECS support,
  headless server mode, and animation tooling. Default recommendation:
  **Godot 4 with C# hot paths** for license freedom (MIT) and headless ease.
- **Simulation core language**: **Rust** for the deterministic core (physiology,
  protocol engine, CAD, scenario runtime), exposed to the engine over FFI or
  gRPC. Rationale: determinism, performance, no GC jitter, strong type safety.
- **Physiology**: integrate **Pulse Physiology Engine** (Apache 2.0, C++) via
  FFI for the cardiovascular/respiratory/PK-PD core; wrap with our Rust API.
- **Geospatial**: GDAL/PROJ, OSM PBF importers, USGS DEM.
- **Data**: YAML for authoring; SQLite for run logs; Parquet for metrics export.
- **Build**: Cargo workspaces for Rust; engine project alongside; a top-level
  `justfile` or `make` to orchestrate.
- **Testing**: `cargo test` + property tests (`proptest`); golden-file scenario
  tests; engine-side integration tests via headless runs.
- **CI**: GitHub-Actions-compatible config; build all platforms; run
  deterministic scenario regressions on every PR.

> Decision is not final until Phase 0 prototyping (§9) validates Pulse FFI
> integration and headless rendering on macOS, Windows, and Linux.

---

## 6. Module Breakdown

Each module owns a directory, a public Rust crate (or engine module), and a
data schema. Modules communicate only via well-defined messages.

1. `core-time` — clock, scheduler, deterministic PRNG.
2. `core-ecs` — entities, components, systems, queries.
3. `physiology` — Pulse wrapper + extensions (trauma overlay, comorbidities).
4. `pharmacology` — drug DB, PK/PD, route-of-administration effects.
5. `procedures` — multi-step interventions, success modeling, equipment state.
6. `protocols` — DSL parser, evaluator, grading, deviation logging.
7. `patient-authoring` — patient templates, randomized variants, MCI rosters.
8. `scenario-runtime` — scenario script interpreter, triggers, branching.
9. `world` — terrain, addresses, buildings, interiors, weather, time-of-day.
10. `vehicles` — dynamics, lights/siren, comms, equipment loadouts.
11. `traffic-ai` — civilian/commercial vehicle and pedestrian behavior.
12. `cad-dispatch` — call intake, EMD, unit recommendation, status board.
13. `comms` — radio model (channels, dead zones, trunked sim), MDT messages.
14. `client-3d` — engine project, rendering, input, UI/HUD.
15. `client-dispatch` — 2D dispatcher console.
16. `client-instructor` — scenario control, snapshot, inject, replay.
17. `debrief` — replay, metrics, transcript, scoring.
18. `epcr` — documentation forms, narrative parsing/grading.
19. `metrics` — KPIs (response time, scene time, ROSC rate, protocol
    adherence), Parquet export.
20. `tools-authoring` — editors for scenarios, patients, protocols, maps.

---

## 7. Data Model (high-level)

- **Scenario**: id, map ref, weather, time, calls[], grading rubric, seed.
- **Call**: address, caller profile, EMD card, true underlying pathology
  (often differs from caller's report), arrival timeline, witnesses.
- **Patient**: demographics, baseline physiology overrides, comorbidities,
  meds, allergies, injuries[], pathology timeline.
- **Pathology**: a time-keyed sequence of physiological perturbations the
  underlying model applies until resolved by treatment (e.g., STEMI lesion,
  tension pneumothorax, anaphylaxis, sepsis).
- **Protocol**: as in §3.3.
- **Drug**: PK params, PD effect functions, contraindications, max dose.
- **Procedure**: steps[], required equipment, skill modifiers, complications.
- **Vehicle**: type, dynamics params, loadout, status.
- **Unit**: vehicle + crew + radio id + current status (per NEMSIS eUnit).
- **Run log**: every event (input, sim state delta, outcome) as an
  append-only log keyed by tick — enables full replay and debrief.

Where standards exist, align field names and code sets with **NEMSIS v3.5+**
to ease later interop.

---

## 8. AI / Agents

- **Patient agent**: drives speech, expressions, and cooperation based on LOC,
  pain, anxiety, language, and culture flags.
- **Bystander agent**: helpful, panicked, obstructive, or hostile; can be
  recruited for CPR, hold C-spine, retrieve AED.
- **Partner/crew AI**: when running solo, the partner can perform delegated
  tasks at realistic speeds and skill levels.
- **Dispatcher AI**: when the player is on the truck, dispatch is AI; when
  the player is the dispatcher, callers and field units may be AI.
- **Driver AI**: when the player is treating in back, AI drives with
  configurable aggressiveness and skill.

All agents are deterministic given the seed.

---

## 9. Roadmap (phased)

Each phase ends with a demo and a go/no-go review.

### Phase 0 — Foundations & spike (2–3 weeks)
- Validate Pulse FFI from Rust on macOS/Windows/Linux.
- Validate headless Godot/Unity build and Rust ↔ engine bridge.
- Pick the final engine and lock the stack.
- Establish repo layout, CI, formatting, lint, license headers.
- Deliverable: a single 3D scene with one patient whose SpO2 drops and
  recovers when oxygen is applied — entirely driven by the physiology core.

### Phase 1 — Single-patient single-call vertical slice (6–8 weeks)
- One map (small town block), one ambulance, one crew of two.
- Call intake → dispatch → drive → assess → treat → transport → handoff for
  one chief complaint (chest pain).
- Protocol engine MVP for chest-pain adult.
- ePCR MVP and minimal debrief with timeline + protocol adherence.
- Deliverable: end-to-end playable run with full audit log and replay.

### Phase 2 — Breadth of pathology (8–10 weeks)
- Add: respiratory distress, cardiac arrest, anaphylaxis, stroke, seizure,
  hypoglycemia, OD/Narcan, trauma (penetrating + blunt), pediatric, OB.
- Add full ALS skill set: 12-lead, defib/cardiovert/pace, IV/IO, advanced
  airway with confirmation, needle decompression, drug-assisted intubation.
- Random patient generator with comorbidity distributions.

### Phase 3 — Operational realism (8–10 weeks)
- Traffic + weather + night ops.
- Vehicle dynamics tuned with subject-matter experts.
- Radio/comms model and MDT.
- Multi-unit responses, mutual aid, staging.

### Phase 4 — Multi-player & instructor tooling (6–8 weeks)
- Authoritative server with 2–6 player crews.
- Instructor console: pause, snapshot, inject, fast-forward, evaluate.
- Scenario authoring tool (graphical) on top of the YAML schema.

### Phase 5 — MCI, specialty, and accreditation push (10–12 weeks)
- MCI with START/JumpSTART triage, command structure, multi-agency.
- Hazmat staging interface, technical rescue handoffs.
- Validation studies with partner agencies; pursue alignment with CoAEMSP,
  NREMT psychomotor competencies, and CAPCE for CE credit.

### Phase 6 — Polish, localization, and platform (ongoing)
- Localization (en, es initially; protocol packs per region).
- Accessibility (subtitles, colorblind-safe ECG, key remapping).
- Performance targets: 60 FPS at 1080p on a mid-range GPU; sim core under
  5 ms/tick on a 2020-era laptop CPU.

---

## 10. Project Structure (target)

```
EMS_simulator/
├── README.md
├── CLAUDE.md
├── justfile
├── Cargo.toml                 # Rust workspace
├── crates/
│   ├── core-time/
│   ├── core-ecs/
│   ├── physiology/
│   ├── pharmacology/
│   ├── procedures/
│   ├── protocols/
│   ├── scenario-runtime/
│   ├── cad-dispatch/
│   ├── comms/
│   ├── world/
│   ├── vehicles/
│   ├── traffic-ai/
│   ├── metrics/
│   └── sim-server/            # gRPC entry point
├── engine/                    # Godot or Unity project
│   ├── client-3d/
│   ├── client-dispatch/
│   └── client-instructor/
├── data/
│   ├── protocols/
│   ├── drugs/
│   ├── procedures/
│   ├── patients/
│   ├── scenarios/
│   └── maps/
├── tools/
│   └── authoring/
├── docs/
│   ├── architecture/
│   ├── clinical/              # citations, validation reports
│   └── adr/                   # architecture decision records
└── tests/
    ├── golden-scenarios/
    └── physiology-fixtures/
```

---

## 11. Coding Standards & Agent Behavior

These rules apply to Kiro and human contributors equally.

1. **Determinism is a test**, not a hope. Every PR that touches the sim core
   must include or update a golden-scenario test.
2. **No magic numbers in code.** Physiological and pharmacological constants
   live in `data/` with citations.
3. **No clinical content without a citation.** A drug, protocol, or
   pathophysiology entry without a `sources:` field fails CI.
4. **ECS purity.** Systems do not mutate components they did not query for.
5. **Headless first.** New simulation features must be demonstrable via a
   headless test before any 3D work begins.
6. **ADR for every cross-module decision.** Add to `docs/adr/` using the
   Nygard template.
7. **Inclusive language** per the workspace inclusivity rules. Use
   "primary/replica," "allowlist/denylist," etc.
8. **Brazil/CRUX integration** is not used here unless this project is later
   imported into a Brazil workspace; for now, standard `git` and conventional
   commits apply.
9. **Commit messages** follow Conventional Commits. Subject ≤ 50 chars,
   imperative mood.
10. **Ask before destructive moves.** Schema migrations, map data deletions,
    and protocol-pack overwrites require explicit confirmation.

### 11.1 Agent priorities when ambiguity arises

In order: **clinical correctness → determinism → operational realism →
performance → visual polish.** Never sacrifice a higher item for a lower one
without a written ADR.

---

## 12. Validation Strategy

- **Unit tests** on every Rust crate.
- **Golden scenarios**: ~20 canonical runs (e.g., "witnessed VF arrest, bystander
  CPR, AED at 4 min, ALS at 8 min") stored as input + expected metric ranges.
  CI fails if outputs drift outside tolerance.
- **Physiology fixtures**: known clinical vignettes (textbook cases) with
  expected vitals trajectories at key time points.
- **SME review**: a paramedic, EM physician, and dispatcher review each
  protocol pack and a sample of scenarios before release.
- **User studies**: post-Phase 3, run think-aloud sessions with EMS students
  and seasoned medics; track presence, learning gain, and protocol adherence.

---

## 13. Open Questions (track in `docs/adr/`)

- Pulse vs. in-house physiology subset — licensing, performance, extensibility.
- Godot 4 vs. Unity 6 — final engine choice.
- Map data licensing for commercial release (OSM ODbL implications).
- Multiplayer transport — gRPC streaming vs. custom UDP for in-vehicle
  scenarios with low-latency haptics.
- Voice: TTS for patients/dispatch vs. recorded VO; voice recognition for
  radio comms.

---

## 14. Immediate Next Actions

1. Create `docs/adr/0001-engine-and-sim-core-stack.md` capturing the Phase 0
   decision criteria.
2. Set up the Rust workspace skeleton (`Cargo.toml`, `crates/core-time`,
   `crates/physiology` stub).
3. Spike: link Pulse from a Rust crate; run the "apnea + oxygen" vignette and
   log SpO2 to CSV.
4. Spike: headless Godot 4 / Unity 6 build that connects to the Rust sim over
   gRPC and renders one patient on a stretcher.
5. Stand up CI with `cargo fmt`, `cargo clippy -D warnings`, `cargo test`, and
   the engine headless smoke test.
6. Draft the first protocol pack (`data/protocols/chest-pain-adult.yaml`) with
   citations.

When in doubt about scope or fidelity, default to "what would a paramedic
preceptor expect a student to see and do?" and build that.
