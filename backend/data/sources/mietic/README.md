# MIETIC — credentialed source

**The data files in this directory are git-ignored and must never be committed.**

MIETIC case data is obtained via PhysioNet and may require credentialing / a data
use agreement. Obtain it through PhysioNet, complete any required CITI training and
DUA, and place the files here.

The loader in `backend/app/data/mietic.py` normalizes MIETIC cases to `TriageCase`,
enforcing de-identification (`provenance.deidentified == true`, age **bands** only).

Until then, the app runs on `mimic_demo` (open-access) + `synthetic`.

**Citation:** cite MIETIC per its PhysioNet terms in any publication.
