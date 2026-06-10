# Security Policy

## Scope

ED Triage Trainer is an **educational training tool, not a medical device**, and
must never be used for real clinical decision-making. It processes only
de-identified open-access or synthetic data.

## Reporting a vulnerability

Please report security issues privately via a
[GitHub security advisory](https://github.com/jaeHbk/EMS_simulator/security/advisories/new)
(preferred) or by opening an issue that does **not** include exploit details or any
sensitive data. We aim to acknowledge reports promptly and will coordinate a fix and
disclosure timeline with you.

## Data handling expectations

- **No credentialed data in the repo.** Full MIMIC-IV-ED and MIETIC payloads require a
  PhysioNet Data Use Agreement and must never be committed. The `.gitignore` enforces
  this for `backend/data/sources/mimic_full/` and `.../mietic/`; do not bypass it.
- **No identifiers.** Cases carry de-identified age **bands** only — never exact ages,
  dates, or direct identifiers. The data loader rejects non-de-identified cases.
- **No secrets in code or commits.** The cloud LLM path uses the operator's own API
  key supplied via environment variables; never commit a key. See `backend/.env.example`.

## Deployment notes

- The default configuration is offline (`LLM_PROVIDER=local`) and binds to localhost.
- When deploying, set `CORS_ALLOW_ORIGINS` to your real frontend origin and supply LLM
  credentials only through the environment, not source control.
