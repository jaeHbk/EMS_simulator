# MIMIC-IV-ED (Full) — credentialed source

**The data files in this directory are git-ignored and must never be committed.**

The full MIMIC-IV-ED dataset is **not** open-access. To use it you must:

1. Become a credentialed PhysioNet user (complete CITI "Data or Specimens Only
   Research" training).
2. Sign the PhysioNet Credentialed Health Data Use Agreement.
3. Download MIMIC-IV-ED from https://physionet.org/content/mimic-iv-ed/.

Place the extracted CSVs here (e.g. `edstays.csv.gz`, `triage.csv.gz`,
`vitalsign.csv.gz`, ...). The loader in `backend/app/data/mimic_full.py` reads them
and normalizes to `TriageCase`, enforcing de-identification
(`provenance.deidentified == true`, age **bands** only).

Until then, the app runs on `mimic_demo` (open-access) + `synthetic`.

**Citation:** cite MIMIC-IV-ED per PhysioNet terms in any publication.
