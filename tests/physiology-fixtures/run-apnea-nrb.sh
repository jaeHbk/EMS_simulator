#!/usr/bin/env bash
# ADR-0001 Phase 0 spike runner.
# Runs the apnea + NonRebreatherMask scenario against a Pulse install and
# leaves the resulting CSV next to the scenario JSON.
#
# Override PULSE_BIN if your Pulse install lives elsewhere.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PULSE_BIN="${PULSE_BIN:-$HOME/src/pulse-build/install/bin}"
SCENARIO="${SCRIPT_DIR}/apnea-nrb.scenario.json"

if [[ ! -x "${PULSE_BIN}/PulseScenarioDriver" ]]; then
  echo "PulseScenarioDriver not found at ${PULSE_BIN}." >&2
  echo "Set PULSE_BIN to the directory containing your Pulse install/bin." >&2
  exit 1
fi

cd "${PULSE_BIN}"
exec ./PulseScenarioDriver "${SCENARIO}"
