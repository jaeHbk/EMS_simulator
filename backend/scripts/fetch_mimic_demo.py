#!/usr/bin/env python3
"""Fetch the open-access MIMIC-IV-ED Demo CSVs into backend/data/sources/mimic_demo/.

The Demo subset (~100 ED stays) is open-access under the Open Data Commons Open
Database License (ODbL) v1.0 — no PhysioNet credentialing required. This script
downloads the files the loader (app/data/_mimic_format.py) expects, decompresses
them to the bare filenames, and writes a PROVENANCE.json (dataset version + a
SHA256 of each file) so the corpus used in any run is reproducible and citable.

The downloaded CSVs are NOT committed (see .gitignore); only this script, the
directory README, and PROVENANCE.json are tracked.

Usage:
    python backend/scripts/fetch_mimic_demo.py

Then enable the source, e.g.:
    ENABLED_SOURCES=mimic_demo,synthetic uvicorn app.main:app --reload

Cite MIMIC-IV-ED and PhysioNet per the dataset page (see docs/ATTRIBUTION.md).
"""

from __future__ import annotations

import gzip
import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

# MIMIC-IV-ED Demo on PhysioNet (open access). Pin the version so PROVENANCE is exact.
DATASET = "mimic-iv-ed-demo"
VERSION = "2.2"
BASE_URL = f"https://physionet.org/files/{DATASET}/{VERSION}/ed"

# Files the loader needs. edstays + triage are required; diagnosis is optional.
# PhysioNet serves them gzipped; we store the decompressed names the loader reads.
FILES: dict[str, bool] = {
    "edstays.csv.gz": True,
    "triage.csv.gz": True,
    "diagnosis.csv.gz": False,  # optional
}

DEST = Path(__file__).resolve().parents[1] / "data" / "sources" / "mimic_demo"


def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "ed-triage-trainer/fetch"})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 - fixed https host
        return resp.read()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    DEST.mkdir(parents=True, exist_ok=True)
    provenance: dict[str, object] = {
        "dataset": DATASET,
        "version": VERSION,
        "source_url": BASE_URL,
        "license": "Open Data Commons Open Database License (ODbL) v1.0",
        "files": {},
    }
    files_meta: dict[str, dict[str, object]] = {}

    for gz_name, required in FILES.items():
        url = f"{BASE_URL}/{gz_name}"
        bare_name = gz_name.removesuffix(".gz")
        try:
            print(f"  fetching {url} ...")
            gz_bytes = _download(url)
        except urllib.error.HTTPError as exc:
            if not required and exc.code == 404:
                print(f"  (optional {gz_name} not found — skipping)")
                continue
            print(f"ERROR: failed to download {url}: {exc}", file=sys.stderr)
            return 1
        except urllib.error.URLError as exc:
            print(
                f"ERROR: network error fetching {url}: {exc}. "
                "This script needs internet access to PhysioNet.",
                file=sys.stderr,
            )
            return 1

        csv_bytes = gzip.decompress(gz_bytes)
        out_path = DEST / bare_name
        out_path.write_bytes(csv_bytes)
        files_meta[bare_name] = {
            "bytes": len(csv_bytes),
            "sha256": _sha256(csv_bytes),
            "source": url,
        }
        print(f"  wrote {out_path.relative_to(DEST.parents[3])} ({len(csv_bytes):,} bytes)")

    if not files_meta:
        print("ERROR: nothing downloaded.", file=sys.stderr)
        return 1

    provenance["files"] = files_meta
    (DEST / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"\nDone. Wrote {len(files_meta)} file(s) + PROVENANCE.json to {DEST}.")
    print("Enable with ENABLED_SOURCES=mimic_demo,synthetic. Cite per docs/ATTRIBUTION.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
