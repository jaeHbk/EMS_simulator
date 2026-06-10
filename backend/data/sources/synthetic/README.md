# Synthetic cases

Two parts, both fully offline and deterministic (`app/data/synthetic.py`):

## 1. Hand-authored seed cases (`seed/*.json`)

High-quality, clinically reviewed ED presentations spanning ESI 1–5. These are
the canonical examples and are loaded first. Each file is one `TriageCase` JSON
object conforming to `shared/schemas/triage-case.schema.json`, with:

- `provenance.license = "synthetic-generated"`
- `provenance.deidentified = true`
- age **bands** only in `demographics.ageBand`

Current seed set:

| File | ESI | Presentation |
|------|-----|--------------|
| `anaphylaxis-001.json` | 1 | Anaphylaxis with airway + hypotension |
| `cardiac-arrest-002.json` | 1 | Post-arrest ROSC, unresponsive |
| `stemi-chest-pain-003.json` | 2 | Crushing chest pain / STEMI |
| `stroke-004.json` | 2 | Acute stroke within window |
| `sepsis-005.json` | 2 | Septic shock with altered mental status |
| `asthma-exacerbation-006.json` | 3 | Moderate asthma exacerbation |
| `abdominal-pain-007.json` | 3 | RLQ pain / appendicitis |
| `laceration-008.json` | 4 | Simple forearm laceration |
| `ankle-sprain-009.json` | 4 | Minor ankle injury |
| `prescription-refill-010.json` | 5 | Medication refill, well-appearing |

## 2. Deterministic generator

`generate_cases(seed=GENERATOR_SEED)` expands clinical archetypes into a diverse
but plausible set with vitals, red flags, expert labels, and some outcomes. It
uses a single fixed-seed RNG (no network, no wall-clock) so output is
reproducible — tests assert byte-for-byte determinism across calls.

## Disclaimer

This is a **training tool, not a medical device**. All synthetic cases are
fictional and for educational triage practice only.
