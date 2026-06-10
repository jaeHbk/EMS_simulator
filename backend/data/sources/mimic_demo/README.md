# MIMIC-IV-ED Demo (open-access)

This directory holds the open-access **MIMIC-IV-ED Demo** subset from PhysioNet
(Open Data Commons ODbL v1.0). The CSVs are **fetched locally and not committed**
(`.gitignore` excludes `*.csv` / `*.csv.gz` here); only this README and the
generated `PROVENANCE.json` are tracked.

## Fetch it

```bash
python backend/scripts/fetch_mimic_demo.py
```

This downloads the required CSVs into this directory, decompresses them to the
filenames below, and writes `PROVENANCE.json` (dataset version + SHA256 per file)
for reproducibility. Then enable the source: `ENABLED_SOURCES=mimic_demo,synthetic`.

## Offline-first

The loader (`app/data/mimic_demo.py`) is offline-first: **if these CSVs are
absent, `load()` returns `[]`** and the app falls back to the synthetic source.
Nothing here is required for the app to run.

## Expected files

Place the demo CSVs directly in this directory:

| File | Required | Columns used |
|------|----------|--------------|
| `edstays.csv` | yes | `stay_id`, `subject_id`, `gender`, `disposition`, optional `anchor_age` |
| `triage.csv` | yes | `stay_id`, `chiefcomplaint`, `acuity` (= ESI 1–5), `heartrate`, `sbp`, `dbp`, `resprate`, `o2sat`, `temperature` (°F), `pain` |
| `diagnosis.csv` | optional | `stay_id`, `icd_title` (or `icd_code`) |

Notes:
- `acuity` maps directly to the reference ESI level (1 = most acute).
- `temperature` is recorded in Fahrenheit and converted to Celsius on load.
- Exact ages are **never** emitted — `anchor_age` (if present) is bucketed into a
  HIPAA Safe-Harbor age band; ages 85+ are aggregated.

## Where to get it

PhysioNet MIMIC-IV-ED Demo: <https://physionet.org/content/mimic-iv-ed-demo/>
(open access, no credentialing required).

## Disclaimer

This is a **training tool, not a medical device**. Data here is de-identified
and used solely for educational triage practice.
