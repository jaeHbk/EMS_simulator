# Physiology fixtures

Canonical Pulse Physiology Engine traces used as reference output for the
`physiology` crate's regression and cross-platform determinism checks.

## ADR-0001 spike: apnea + NonRebreatherMask

- `apnea-nrb.scenario.json` — Pulse scenario authored to satisfy ADR-0001
  Phase 0 spike. 30 s baseline, then `Dyspnea(TidalVolumeSeverity=1.0)`
  (Pulse's canonical apnea modeling), 60 s of unsupported apnea, then
  `SupplementalOxygen(NonRebreatherMask, 15 L/min)`, then 5 min of observation.
- `apnea-nrb.macos-arm64.csv` — reference trace on macOS / Apple silicon,
  Pulse REL_4_3_2 (commit `e8a36497b`). Linux + Windows traces will be added
  in step 3 of the spike.
- `run-apnea-nrb.sh` — driver that invokes `PulseScenarioDriver` and writes
  the result CSV next to the scenario.

### Reproducing

```
PULSE_BIN=$HOME/src/pulse-build/install/bin ./run-apnea-nrb.sh
```

The Pulse install must be built with the C++ runtime, the Java API, and have
runtime data (`patients/`, `substances/`, `states/`) generated. See
`docs/adr/0001-engine-and-sim-core-stack.md` for the build steps that
produced this reference trace.

### Expected behavior

The clinical teaching point — and the spike's primary validation — is that
applying high-flow O2 to an apneic patient does **not** restore SpO2:

| t (s) | event | SpO2 | HR (bpm) |
|------:|-------|-----:|---------:|
|     0 | baseline | 0.974 | 72 |
|    30 | apnea induced | 0.974 | 72 |
|    90 | NonRebreatherMask applied | 0.846 | 114 |
|   160 | continued apnea, NRB on | 0.600 | 146 |
|   240 | brain oxygen deficit | 0.371 | 155 |

Any cross-platform CSV that diverges from `apnea-nrb.macos-arm64.csv` by
more than 1e-9 per sample fails ADR-0001's determinism criterion.
