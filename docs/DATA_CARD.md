# Data Card — ED Triage Trainer

This card documents the data the simulator uses, what is actually shipped, the
known limits of the labels, and the de-identification guarantees. It is intended
to answer the questions a medical-education or clinical-informatics reviewer will
ask. See [`ATTRIBUTION.md`](ATTRIBUTION.md) for licensing/citation.

## Sources & status

| Source | Access | Status in this repo |
|--------|--------|---------------------|
| Synthetic generator + 10 hand-authored seed cases | None | **Shipped** (the only corpus committed) |
| MIMIC-IV-ED **Demo** (~100 ED stays) | Open-access (ODbL v1.0) | **Fetch locally** via `backend/scripts/fetch_mimic_demo.py`; not committed |
| MIMIC-IV-ED **Full** | PhysioNet credentialing + signed DUA | Loader path only; data git-ignored, never committed |
| MIETIC | PhysioNet credentialing | Loader path only; data git-ignored |

**Honest statement of what runs by default:** out of the box the app uses the
synthetic corpus only. Real MIMIC-IV-ED Demo data is an opt-in local fetch (open
access, no credentialing); the full dataset and MIETIC are documented loader paths
for credentialed users. Nothing about the app hard-codes a source — every source
normalizes to one `TriageCase`.

## Shipped (synthetic) corpus composition

The committed corpus is the 10 seed cases plus the deterministic generator's
expansions. ESI distribution of the seeds: ESI 1 ×2, ESI 2 ×3, ESI 3 ×2, ESI 4 ×2,
ESI 5 ×1. Each seed carries a chief complaint, hidden HPI/PMH/meds/allergies/social,
red flags (with concept keywords for paraphrase-tolerant scoring), ground-truth
vitals, expert ESI + the ESI v4 decision inputs (`requiresLifeSaving`, `isHighRisk`,
`resourcesPredicted`), expert critical interventions, and — where applicable — a real
disposition for outcome alignment. Every authored ESI label is checked in CI against
the cited ESI v4 algorithm (`app/scoring/esi_algorithm.py`); see the consistency test.

## Label validity (critical caveat)

The expert ESI label's validity differs by source and **must be stated in any
publication**:

- **Synthetic cases:** the expert ESI is author-assigned and validated against the
  published ESI v4 algorithm (steps A–D, incl. age-banded danger-zone vitals; sources
  in `app/scoring/esi_algorithm.py`). It is internally consistent and cited, but it is
  not an independent multi-rater gold standard.
- **MIMIC-IV-ED `triage.acuity`:** this is the **operational triage-nurse ESI recorded
  in real time** during the original ED encounter. It is NOT an adjudicated gold
  standard: triage ESI has well-documented inter-rater variability and its own
  under-triage rate. Treating it as ground truth inherits those biases. Any evaluation
  using MIMIC labels should report this limitation and ideally compare against a
  re-adjudicated subset.

## Gradable dimensions by source

The five scoring dimensions are not all gradable on every source:

| Dimension | Synthetic | MIMIC-derived |
|-----------|-----------|---------------|
| ESI accuracy | ✓ | ✓ (vs nurse ESI — see caveat) |
| History completeness (red flags) | ✓ | ✗ (MIMIC has no curated red flags) |
| Vitals acquisition | ✓ | ✓ (triage vitals present) |
| Intervention recognition | ✓ | ✗ (no curated expert intervention list) |
| Outcome alignment | where outcome authored | ✓ (real disposition) |

MIMIC-derived cases therefore exercise ESI + vitals + outcome but not the
history/intervention dimensions, which depend on curated expert content the raw
dataset does not provide. This is a known gap; a future direction is curating
red-flag/intervention annotations for a MIMIC subset.

## De-identification guarantees (enforced in code)

- The loader rejects any case whose `provenance.deidentified` is not true
  (`app/data/registry.py`), and the MIMIC formatter sets it only after a positive
  scan for direct-identifier columns (`app/data/_mimic_format.py`).
- Ages are emitted as **bands** (HIPAA Safe Harbor), never exact ages or dates.
- Credentialed payloads are `.gitignore`d and never committed; the open Demo CSVs
  are fetched locally and also not committed (only a `PROVENANCE.json` with file
  hashes is trackable, for reproducibility).

## Reproducibility

`fetch_mimic_demo.py` pins the PhysioNet dataset version and records a SHA256 of each
downloaded file in `PROVENANCE.json`, so the exact corpus behind a result can be
reproduced and cited.
