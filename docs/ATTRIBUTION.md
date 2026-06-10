# Data Attribution & Licensing

The **code** in this repository is MIT-licensed (see [`LICENSE`](../LICENSE)).
Clinical data retains its original license and must be cited per its provider's terms.

## MIMIC-IV-ED (and MIMIC-IV-ED Demo)

- Source: PhysioNet — https://physionet.org/content/mimic-iv-ed/
- The **full** dataset requires PhysioNet credentialing (CITI "Data or Specimens
  Only Research" training) plus a signed Credentialed Health Data Use Agreement.
- The **Demo** subset is open-access under the Open Data Commons Open Database
  License (ODbL) v1.0 — https://physionet.org/content/mimic-iv-ed-demo/
- Cite MIMIC-IV-ED and PhysioNet per the citation block on the dataset page.
- **Label caveat:** `triage.acuity` in MIMIC is the **operational triage-nurse ESI**
  recorded in real time. It is NOT an adjudicated gold-standard label and carries
  known inter-rater variability. See [`DATA_CARD.md`](DATA_CARD.md).

## MIETIC

- Source: PhysioNet. Obtain per its access terms and cite per its dataset page.

## Synthetic cases

- Cases under `backend/data/sources/synthetic/` are generated or hand-authored for
  this project (`provenance.license = "synthetic-generated"`). They contain no real
  patient data.

## What is committed

- Only the open-access MIMIC-IV-ED Demo (once fetched locally) and synthetic cases.
- Credentialed payloads under `backend/data/sources/mimic_full/` and `.../mietic/`
  are `.gitignore`d and must never be committed.
