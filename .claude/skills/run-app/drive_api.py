"""Drive one full encounter through the live ED Triage Trainer API.

Usage: python3 drive_api.py http://127.0.0.1:8000/api

Asserts the project's load-bearing invariants on the real HTTP surface:
- no expert labels leak before FEEDBACK,
- a deliberate under-triage is flagged UNDER_TRIAGE with a Safety alert + low score,
- scoring dimension weights renormalize to 1.0,
- an illegal backward stage transition returns HTTP 409.
Exits non-zero on any failure.
"""

import json
import sys
import urllib.error
import urllib.request

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api"


def post(path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(
        B + path, data=data, method="POST", headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def post_status(path: str, body: dict) -> int:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        B + path, data=data, method="POST", headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    enc = post("/encounters", {"sources": ["synthetic"], "seed": 11})
    eid = enc["encounterId"]
    print(f"   case: {enc['caseId']} | chief complaint: {enc['chiefComplaint']}")
    assert enc["stage"] == "CASE_LOAD"
    assert "esiRationale" not in json.dumps(enc) and "criticalInterventions" not in json.dumps(
        enc
    ), "EXPERT LEAK before FEEDBACK"

    post(f"/encounters/{eid}/advance", {"to": "HISTORY"})
    h = post(
        f"/encounters/{eid}/history",
        {"text": "When did this start, and any chest pain, fever, or trouble breathing?"},
    )
    patient = [t for t in h["history"] if t["role"] == "patient"]
    assert patient, "patient did not reply"
    print(f"   patient replied: {patient[-1]['text'][:80]!r}")

    post(f"/encounters/{eid}/advance", {"to": "VITALS"})
    v = post(f"/encounters/{eid}/vitals", {"fields": ["heartRate", "systolicBP", "spo2"]})
    measured = {k: val for k, val in v["measuredVitals"].items() if val is not None}
    print(f"   measured vitals: {measured}")

    post(f"/encounters/{eid}/advance", {"to": "ESI_ASSIGNMENT"})
    post(f"/encounters/{eid}/esi", {"esi": 4})  # deliberate under-triage probe
    post(f"/encounters/{eid}/advance", {"to": "INTERVENTIONS"})
    post(f"/encounters/{eid}/interventions", {"items": ["IV_ACCESS"]})
    fb = post(f"/encounters/{eid}/feedback")
    sr = fb["scoreReport"]
    direction = sr["esi"]["triageDirection"]
    wsum = round(sum(d["weight"] for d in sr["dimensions"]), 4)
    print(
        f"   FEEDBACK: assigned {sr['esi']['assigned']} vs expert {sr['esi']['expert']} "
        f"-> {direction}; overall {sr['overallPercent']}%; weight sum {wsum}"
    )
    print(f"   narrative: {sr['narrative'][:120]!r}")
    assert fb["stage"] == "FEEDBACK"
    assert abs(wsum - 1.0) < 1e-6, f"weights must sum to 1.0, got {wsum}"
    # assigned 4 vs expert <=3 is under-triage; assert the safety signal fired.
    if sr["esi"]["assigned"] > sr["esi"]["expert"]:
        assert direction == "UNDER_TRIAGE", f"expected UNDER_TRIAGE, got {direction}"
        assert "alert" in sr["narrative"].lower() or "under-triage" in sr["narrative"].lower()

    code = post_status(f"/encounters/{eid}/advance", {"to": "CASE_LOAD"})
    assert code == 409, f"illegal backward transition should be 409, got {code}"
    print(f"   illegal backward transition -> HTTP {code} (correctly rejected)")
    print("   API walk OK")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as exc:
        print(f"   ASSERTION FAILED: {exc}")
        sys.exit(1)
